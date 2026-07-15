import { NextResponse } from "next/server";
import { schedulePost } from "@/lib/library";
import { schedulePostSchema } from "@/lib/domain/library";
import { zernioConfigured, zernioSchedule } from "@/lib/library/zernio";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/library/schedule — queue a library asset to a platform at a time. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = schedulePostSchema.omit({ createdBy: true }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    // Push to Zernio's native scheduler ONLY when the caller actually asked for Zernio, so it holds the
    // schedule (and cancel can reach it). Otherwise the post stays local/manual.
    //
    // WOB-UAT-028: this used to gate on `zernioConfigured()` ALONE, and `schedulePost` gates only on
    // `publisher !== "manual"` — so with a Zernio key present, a post requested as `ayrshare` was really
    // published THROUGH ZERNIO, given a Zernio publisherRef, and reconciled to `published` by the Zernio
    // webhook, while the row still claimed `publisher='ayrshare'`. A real external post under a false
    // provider label is worse than the dead-end it sat next to: the dead-end lost work, this one
    // misreports where work went. Removing ayrshare/n8n from PUBLISHERS closes the reported case; this
    // check closes the CLASS, so the next publisher added cannot inherit it.
    const wantsZernio = parsed.data.publisher === "zernio";
    const scheduleRemote = wantsZernio && zernioConfigured() ? (args: Parameters<typeof zernioSchedule>[0]) => zernioSchedule(args) : undefined;
    const post = await schedulePost({ ...parsed.data, createdBy: auth }, { scheduleRemote });
    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: /not found/.test(message) ? 404 : /archived/.test(message) ? 409 : 500 });
  }
}
