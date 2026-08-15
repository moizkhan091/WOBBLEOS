import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/os/os-ui";
import { SESSION_COOKIE } from "@/lib/auth/edge";
import { verifySession } from "@/lib/auth";

/**
 * The gate that actually honours revocation.
 *
 * The edge proxy can only check a JWT's signature and expiry, because the edge runtime has no database.
 * That is fine as a cheap first filter and wrong as the only one: a session revoked by a logout or a
 * password rotation keeps a signature-valid cookie for the rest of its 30-day life, so the proxy waved
 * it through and every app page returned 200. A founder who had just been signed out opened a tab, saw
 * the OS shell with "Guest" in the corner, and reasonably read it as a breach.
 *
 * It was not one. Every API route verifies against the database on each request, so no data was served,
 * and nothing is server-rendered into the HTML. But "the page loads for a revoked session" is not a
 * distinction anyone should have to trust, and the moment a page does render data server-side it stops
 * being true at all.
 *
 * So the render itself now does the real check: session row active, not expired, token hash matching,
 * account still active. This runs on the Node runtime, where the database is reachable.
 */
export const dynamic = "force-dynamic";

export default async function ModuleLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  // No `next` parameter: this layout does not know which module was asked for, and the proxy already
  // adds one on the paths it catches. Sending a revoked session to a clean login page is the point.
  if (!session) redirect("/login");
  return <Shell>{children}</Shell>;
}
