/**
 * Which models the Ask box may offer, derived from Model Control rather than named in code.
 *
 * The chat picker used to carry three model ids as a literal in the source. That quietly broke the one
 * rule the whole cost story rests on: a founder switches models on the Model Control page, and every
 * code path is supposed to follow. This one did not. It offered GPT-4o whatever Model Control said,
 * one click away from a five dollar balance, and there was no way to tell from the page.
 *
 * So the list is built from the same catalog Model Control edits, and Auto names whatever that page
 * currently has on the ask_wobble role. The allowlist survives, because a free-text model id would let
 * anyone with a session point the chat at the most expensive model on OpenRouter, which is the failure
 * this was protecting against in the first place.
 */

import type { ModelCatalogEntry } from "@/lib/domain/model-registry";

export interface ChatModelOption {
  /** Empty string means Auto: whatever Model Control has on the ask_wobble role. */
  id: string;
  label: string;
  description: string;
  /** Can it read an attached image or PDF? The Ask box takes files, so this matters. */
  vision: boolean;
}

/** Two decimals, or fewer when the price is round, so "$0.6" never appears as "$0.60000000000000001". */
function money(usd: number): string {
  return usd >= 1 ? `$${Math.round(usd * 100) / 100}` : `$${Math.round(usd * 1000) / 1000}`;
}

/**
 * What a model costs, said once, in the place a founder chooses it.
 *
 * Output price is the one that moves: a chat answer is mostly output tokens, and the spread between
 * the cheapest and dearest model here is roughly fifty to one.
 */
function priceNote(m: ModelCatalogEntry): string {
  if (m.usdPerMillionOutput === undefined) return "price not recorded";
  return `${money(m.usdPerMillionOutput)} per million out`;
}

/**
 * The options the picker shows.
 *
 * Ordered cheapest first on purpose. The dear model should be a deliberate reach, not the thing your
 * thumb lands on.
 */
export function chatModelOptions(catalog: ModelCatalogEntry[], currentRoleModel: string | null): ChatModelOption[] {
  const usable = catalog
    .filter((m) => m.status === "active" && m.modalities.includes("text"))
    .sort((a, b) => (a.usdPerMillionOutput ?? Number.MAX_SAFE_INTEGER) - (b.usdPerMillionOutput ?? Number.MAX_SAFE_INTEGER));

  const running = currentRoleModel ? usable.find((m) => m.id === currentRoleModel) : undefined;
  const auto: ChatModelOption = {
    id: "",
    label: "Auto",
    // Naming the model is the point. "Auto" on its own tells a founder nothing about what they are
    // about to spend, and this page exists because that mattered.
    description: running
      ? `What Model Control chose: ${running.label}, ${priceNote(running)}`
      : currentRoleModel
        ? `What Model Control chose: ${currentRoleModel}`
        : "Whatever Model Control has set for Ask WOBBLE",
    vision: running ? running.modalities.includes("vision") : true,
  };

  return [
    auto,
    ...usable.map((m) => ({
      id: m.id,
      label: m.label,
      description: [priceNote(m), m.modalities.includes("vision") ? "reads images and PDFs" : "text only"].join(" · "),
      vision: m.modalities.includes("vision"),
    })),
  ];
}

/**
 * May the chat run this model id?
 *
 * Empty means Auto and is always allowed. Anything else has to be an active text model in the catalog,
 * so the picker and the server can never disagree about what is on offer.
 */
export function chatModelAllowed(catalog: ModelCatalogEntry[], id: string | undefined): boolean {
  if (!id || !id.trim()) return true;
  return catalog.some((m) => m.id === id && m.status === "active" && m.modalities.includes("text"));
}
