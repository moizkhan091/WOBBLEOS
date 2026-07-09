import { desc, eq, inArray } from "drizzle-orm";
import { crmCompanies, crmContacts, crmOpportunities, tasks, meetings, projects, invoices, auditLogs } from "@/db/schema";
import { getDb, type Db } from "@/db";

/** Company 360 — everything connected to one company, on one screen. Read-only aggregation. */

export interface CompanyOverview {
  company: Record<string, unknown> | null;
  contacts: Record<string, unknown>[];
  opportunities: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  meetings: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  timeline: Record<string, unknown>[];
  stats: { openDeals: number; wonDeals: number; pipelineValueCents: number; invoicedCents: number; paidCents: number; openTasks: number; activeProjects: number };
}

export async function getCompanyOverview(companyId: string, deps: { db?: Db } = {}): Promise<CompanyOverview> {
  const db = deps.db ?? getDb();
  const [company] = await db.select().from(crmCompanies).where(eq(crmCompanies.id, companyId)).limit(1);

  const [contactRows, oppRows, taskRows, meetingRows, projectRows, invoiceRows] = await Promise.all([
    db.select().from(crmContacts).where(eq(crmContacts.companyId, companyId)).limit(200),
    db.select().from(crmOpportunities).where(eq(crmOpportunities.companyId, companyId)).orderBy(desc(crmOpportunities.createdAt)).limit(200),
    db.select().from(tasks).where(eq(tasks.companyId, companyId)).orderBy(desc(tasks.createdAt)).limit(200),
    db.select().from(meetings).where(eq(meetings.companyId, companyId)).orderBy(desc(meetings.startAt)).limit(200),
    db.select().from(projects).where(eq(projects.companyId, companyId)).orderBy(desc(projects.createdAt)).limit(100),
    db.select().from(invoices).where(eq(invoices.companyId, companyId)).orderBy(desc(invoices.createdAt)).limit(200),
  ]);

  // Timeline: audit entries for the company OR any of its related records.
  const relatedIds = [companyId, ...contactRows.map((r) => r.id), ...oppRows.map((r) => r.id), ...projectRows.map((r) => r.id), ...invoiceRows.map((r) => r.id), ...taskRows.map((r) => r.id), ...meetingRows.map((r) => r.id)];
  const timeline = relatedIds.length
    ? await db.select().from(auditLogs).where(inArray(auditLogs.entityId, relatedIds)).orderBy(desc(auditLogs.createdAt)).limit(60)
    : [];

  const openDeals = oppRows.filter((o) => o.status !== "won" && o.status !== "lost").length;
  const wonDeals = oppRows.filter((o) => o.status === "won").length;
  const pipelineValueCents = oppRows.filter((o) => o.status !== "won" && o.status !== "lost").reduce((s, o) => s + (o.valueCents ?? 0), 0);
  const invoicedCents = invoiceRows.reduce((s, i) => s + (i.totalCents ?? 0), 0);
  const paidCents = invoiceRows.reduce((s, i) => s + (i.amountPaidCents ?? 0), 0);
  const openTasks = taskRows.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;
  const activeProjects = projectRows.filter((p) => p.status !== "completed" && p.status !== "cancelled").length;

  return {
    company: company ?? null,
    contacts: contactRows as Record<string, unknown>[],
    opportunities: oppRows as Record<string, unknown>[],
    tasks: taskRows as Record<string, unknown>[],
    meetings: meetingRows as Record<string, unknown>[],
    projects: projectRows as Record<string, unknown>[],
    invoices: invoiceRows as Record<string, unknown>[],
    timeline: timeline as Record<string, unknown>[],
    stats: { openDeals, wonDeals, pipelineValueCents, invoicedCents, paidCents, openTasks, activeProjects },
  };
}
