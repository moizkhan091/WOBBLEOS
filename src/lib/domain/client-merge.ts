import { z } from "zod";

/**
 * Merging two client containers.
 *
 * The intake deliberately refuses to merge on a fuzzy name match: joining "Wobble" into "Wobble Media"
 * because they look similar destroys a client's history, and that is unrecoverable. The cost of that
 * choice is the occasional genuine twin, which a founder can see and a machine cannot.
 *
 * This is the other half of that decision: find the likely twins, show the evidence, and let a founder
 * merge them deliberately. Nothing here merges automatically, and nothing is deleted, the loser is
 * archived with a pointer to the winner so the decision is reversible by hand.
 */

export interface MergeCandidateInput {
  id: string;
  name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  /** How much history is attached, which decides which side should win by default. */
  weight: number;
}

export interface DuplicatePair {
  /** The container that should absorb the other: more history, or older when tied. */
  keepId: string;
  mergeId: string;
  /** 0-100. Only a shared domain reaches the top of the range. */
  confidence: number;
  /** What actually matched, in plain words, so a founder can disagree. */
  reasons: string[];
}

/** Strip a URL down to the bare host, so "https://www.x.com/about" and "x.com" compare equal. */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const cleaned = url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
  return cleaned && cleaned.includes(".") ? cleaned : null;
}

/** Digits only, so "+92 300 000 0001" and "03000000001" compare on the part that identifies a person. */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-9);
}

/**
 * Normalise a business name for comparison: lowercase, drop punctuation, drop the legal suffixes and
 * the filler words that make the same business look like two.
 */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(pvt|private|ltd|limited|llc|inc|co|company|group|holdings|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find likely duplicates.
 *
 * Confidence is deliberately conservative. A shared domain is the only signal strong enough to be near
 * certain; a shared name alone is a suggestion, because two real clinics in the same city genuinely can
 * be called the same thing.
 */
export function findDuplicates(companies: MergeCandidateInput[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];

  for (let i = 0; i < companies.length; i++) {
    for (let j = i + 1; j < companies.length; j++) {
      const a = companies[i];
      const b = companies[j];
      const reasons: string[] = [];
      let confidence = 0;

      const domainA = domainOf(a.website);
      const domainB = domainOf(b.website);
      if (domainA && domainB && domainA === domainB) {
        confidence = Math.max(confidence, 95);
        reasons.push(`Both use the website ${domainA}.`);
      }

      const emailA = a.email?.trim().toLowerCase();
      const emailB = b.email?.trim().toLowerCase();
      if (emailA && emailB && emailA === emailB) {
        confidence = Math.max(confidence, 90);
        reasons.push(`Both list ${emailA}.`);
      }

      const phoneA = phoneKey(a.phone);
      const phoneB = phoneKey(b.phone);
      if (phoneA && phoneB && phoneA === phoneB) {
        confidence = Math.max(confidence, 85);
        reasons.push("Both list the same phone number.");
      }

      const keyA = nameKey(a.name);
      const keyB = nameKey(b.name);
      if (keyA && keyA === keyB) {
        confidence = Math.max(confidence, 70);
        reasons.push(`Both are called "${keyA}" once punctuation and legal suffixes are removed.`);
      } else if (keyA && keyB && (keyA.startsWith(keyB) || keyB.startsWith(keyA)) && Math.min(keyA.length, keyB.length) >= 6) {
        confidence = Math.max(confidence, 55);
        reasons.push(`One name is the start of the other: "${keyA}" and "${keyB}".`);
      }

      if (!reasons.length) continue;

      // The container with more history wins; on a tie the older one, since links point at it.
      const aWins = a.weight > b.weight || (a.weight === b.weight && a.createdAt.getTime() <= b.createdAt.getTime());
      pairs.push({
        keepId: aWins ? a.id : b.id,
        mergeId: aWins ? b.id : a.id,
        confidence,
        reasons,
      });
    }
  }

  return pairs.sort((x, y) => y.confidence - x.confidence);
}

export const mergeRequestSchema = z.object({
  keepId: z.string().trim().min(1),
  mergeId: z.string().trim().min(1),
}).refine((v) => v.keepId !== v.mergeId, { message: "a container cannot be merged into itself" });
export type MergeRequest = z.infer<typeof mergeRequestSchema>;
