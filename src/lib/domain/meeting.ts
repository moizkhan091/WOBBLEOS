import { z } from "zod";
import { newId } from "@/lib/ids";

/** Meetings / calendar (pure, testable). ERP brief section F. Linked to company/contact/opportunity. */

export const MEETING_MODULE = "meetings";

export const MEETING_TYPES = ["ai_readiness_call", "paid_audit", "proposal_review", "internal_founder", "client_onboarding", "delivery_review", "strategy_session", "finance_discussion", "support_call"] as const;
export const MEETING_STATUSES = ["scheduled", "completed", "rescheduled", "cancelled", "no_show", "needs_follow_up"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface MeetingRow {
  id: string;
  title: string;
  description: string | null;
  meetingType: string;
  startAt: Date | null;
  endAt: Date | null;
  timezone: string | null;
  organizer: string | null;
  attendees: string[];
  companyId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  location: string | null;
  status: string;
  outcome: string | null;
  notes: string | null;
  followUpRequired: boolean;
  createdBy: string | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const createMeetingSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  meetingType: z.enum(MEETING_TYPES).default("ai_readiness_call"),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  timezone: z.string().trim().min(1).optional(),
  organizer: z.string().trim().min(1).optional(),
  attendees: z.array(z.string().trim().min(1)).default([]),
  companyId: z.string().trim().min(1).optional(),
  contactId: z.string().trim().min(1).optional(),
  opportunityId: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1).optional(),
});
export type CreateMeetingInput = z.input<typeof createMeetingSchema>;

export function buildMeetingRow(input: CreateMeetingInput, opts: { now?: Date; id?: string } = {}): MeetingRow {
  const p = createMeetingSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("mtg"),
    title: p.title,
    description: p.description ?? null,
    meetingType: p.meetingType,
    startAt: p.startAt ?? null,
    endAt: p.endAt ?? null,
    timezone: p.timezone ?? null,
    organizer: p.organizer ?? null,
    attendees: p.attendees,
    companyId: p.companyId ?? null,
    contactId: p.contactId ?? null,
    opportunityId: p.opportunityId ?? null,
    location: p.location ?? null,
    status: "scheduled",
    outcome: null,
    notes: p.notes ?? null,
    followUpRequired: false,
    createdBy: p.createdBy ?? null,
    archivedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

const MEETING_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  scheduled: ["completed", "rescheduled", "cancelled", "no_show", "needs_follow_up"],
  rescheduled: ["completed", "cancelled", "no_show", "needs_follow_up"],
  needs_follow_up: ["completed", "cancelled"],
  completed: [],
  cancelled: ["scheduled"],
  no_show: ["scheduled", "cancelled"],
};

export function canTransitionMeeting(from: string, to: MeetingStatus): boolean {
  const allowed = MEETING_TRANSITIONS[from as MeetingStatus];
  return Array.isArray(allowed) && allowed.includes(to);
}
