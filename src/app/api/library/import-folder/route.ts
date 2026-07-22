import { NextResponse } from "next/server";
import { z } from "zod";
import { InvalidImportRootError, importContentFolder, resolveImportRoot } from "@/lib/library/folder-import";
import { requireFounder, isAuthError } from "@/lib/auth/route";

/**
 * POST /api/library/import-folder — bulk-ingest a whole content folder into the Content Library.
 *
 * The founder's real workflow is not "upload one reel"; it is "point WOBBLE at my content folder".
 * The tree is `<root>/<campaign>/<post>/{media, caption.txt}` — 35 campaigns, ~196 posts. This route
 * scans it, copies each media file into the one content-addressed media store, and creates a ready,
 * schedulable asset per post with the caption as its copy.
 *
 * `dryRun: true` is the safe first move: it reports exactly what WOULD be imported, what is already
 * in the library, and every folder that looked wrong — without writing anything.
 *
 * SECURITY: this reads an arbitrary server-side directory, so it is founder-session gated like every
 * sibling route AND the path itself is vetted by `resolveImportRoot` (no `..` segments, must resolve
 * to an existing absolute directory, and must sit inside `LIBRARY_IMPORT_ROOTS` when that env var is
 * set). Only directory names and captions are returned — never file bytes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const importSchema = z.object({
  rootDir: z.string().trim().min(1).max(4000),
  dryRun: z.boolean().default(false),
  limit: z.number().int().positive().max(2000).optional(),
  campaign: z.string().trim().min(1).max(200).optional(),
  ownerScope: z.string().trim().min(1).optional(),
  ownerId: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });

  let root: string;
  try {
    root = await resolveImportRoot(parsed.data.rootDir);
  } catch (error) {
    // A rejected path is the CALLER's problem, and the reason is safe to state (it is the path they
    // just sent). 400, never a generic 500.
    if (error instanceof InvalidImportRootError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 400 });
  }

  try {
    const result = await importContentFolder(root, {
      dryRun: parsed.data.dryRun,
      limit: parsed.data.limit,
      campaign: parsed.data.campaign,
      ownerScope: parsed.data.ownerScope,
      ownerId: parsed.data.ownerId,
      // Attribution comes from the verified session, never from the request body.
      createdBy: auth,
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.dryRun ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
