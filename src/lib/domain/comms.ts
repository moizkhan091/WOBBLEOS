import { z } from "zod";
import { newId } from "@/lib/ids";
import type { RiskTier } from "@/lib/domain/autonomy";

/**
 * Communications outbox — pure domain (Phase 6, Earned Autonomy).
 *
 * A communication is any outbound message the OS produces: an INTERNAL notification, an EXTERNAL comm draft, or a
 * proposal-send package. It moves PREPARED (a reversible draft) → READY (staged for a founder send) → SENT | CANCELLED.
 *
 * The autonomy split is the whole point:
 *   - PREPARING an external comm / proposal-send, and DELIVERING a low-risk internal notification, are REVERSIBLE →
 *     an earned, scope-matched grant can RELEASE them (autonomous-within-policy).
 *   - SENDING an external comm / proposal is externally-visible + irreversible → it is confirm-capped: NO policy can
 *     push it past `confirm`, so the founder is always in the loop for the actual send.
 */

export const COMMUNICATION_MODULE = "communications";

export const COMMUNICATION_CHANNELS = ["internal_notification", "external_email", "external_dm", "external_other", "proposal_send"] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const COMMUNICATION_STATUSES = ["prepared", "ready", "sent", "cancelled"] as const;
export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

/** Internal notifications are low-risk + retractable (reversible). Every EXTERNAL channel + a proposal send is
 *  externally-visible: once dispatched it cannot be un-sent, so the SEND is irreversible → confirm-capped. */
export function isExternalChannel(channel: CommunicationChannel): boolean {
  return channel !== "internal_notification";
}

/** The autonomy CATEGORY + shape for PREPARING/DELIVERING a communication (the RELEASE-able action point).
 *  Preparation of any channel is reversible; delivering an internal notification is reversible → all low-risk. */
export function preparationAction(channel: CommunicationChannel): { category: string; reversible: boolean; riskLevel: RiskTier; qaPassed: boolean } {
  const category =
    channel === "internal_notification" ? "notification.internal"
    : channel === "proposal_send" ? "proposal.send.prepare"
    : "comms.external.prepare";
  return { category, reversible: true, riskLevel: "low", qaPassed: true };
}

/** The autonomy CATEGORY + shape for SENDING a communication (the CONFIRM-CAPPED action point). An internal
 *  notification "send" is just delivery (reversible, low-risk); an external/proposal send is IRREVERSIBLE →
 *  `reversible:false` makes the hard sensitivity cap force a `confirm` ceiling regardless of any grant. */
export function sendAction(channel: CommunicationChannel): { category: string; reversible: boolean; riskLevel: RiskTier; qaPassed: boolean } {
  if (channel === "internal_notification") return { category: "notification.internal", reversible: true, riskLevel: "low", qaPassed: true };
  const category = channel === "proposal_send" ? "proposal.send" : "comms.external.send";
  return { category, reversible: false, riskLevel: "medium", qaPassed: true };
}

const COMMUNICATION_TRANSITIONS: Record<CommunicationStatus, CommunicationStatus[]> = {
  prepared: ["ready", "sent", "cancelled"],
  ready: ["sent", "cancelled"],
  sent: [],
  cancelled: [],
};
export function canTransitionCommunication(from: string, to: CommunicationStatus): boolean {
  return (COMMUNICATION_TRANSITIONS[from as CommunicationStatus] ?? []).includes(to);
}

export interface CommunicationRow {
  id: string;
  channel: CommunicationChannel;
  kind: string;
  subject: string;
  body: string;
  audience: string | null;
  status: CommunicationStatus;
  riskLevel: RiskTier;
  scopeType: string;
  companyId: string | null;
  clientId: string | null;
  projectId: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  autonomyLevel: string | null;
  autonomyPolicyId: string | null;
  actedAutonomously: boolean;
  preparedBy: string;
  sentBy: string | null;
  dedupeKey: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  cancelledAt: Date | null;
}

export const prepareCommunicationSchema = z.object({
  channel: z.enum(COMMUNICATION_CHANNELS),
  kind: z.string().trim().min(1).max(60),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1),
  audience: z.string().trim().min(1).max(200).optional(),
  scopeType: z.enum(["company", "client", "project", "founder", "department"]).default("company"),
  companyId: z.string().trim().min(1).optional(),
  clientId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  relatedEntityType: z.string().trim().min(1).max(40).optional(),
  relatedEntityId: z.string().trim().min(1).max(120).optional(),
  preparedBy: z.string().trim().min(1),
  dedupeKey: z.string().trim().min(1).max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type PrepareCommunicationInput = z.input<typeof prepareCommunicationSchema>;

export function buildCommunicationRow(input: PrepareCommunicationInput, opts: { id?: string; now?: Date } = {}): CommunicationRow {
  const parsed = prepareCommunicationSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("comm"),
    channel: parsed.channel,
    kind: parsed.kind,
    subject: parsed.subject,
    body: parsed.body,
    audience: parsed.audience ?? null,
    status: "prepared",
    riskLevel: "low",
    scopeType: parsed.scopeType,
    companyId: parsed.companyId ?? null,
    clientId: parsed.clientId ?? null,
    projectId: parsed.projectId ?? null,
    relatedEntityType: parsed.relatedEntityType ?? null,
    relatedEntityId: parsed.relatedEntityId ?? null,
    autonomyLevel: null,
    autonomyPolicyId: null,
    actedAutonomously: false,
    preparedBy: parsed.preparedBy,
    sentBy: null,
    dedupeKey: parsed.dedupeKey ?? null,
    metadata: parsed.metadata ?? {},
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    cancelledAt: null,
  };
}
