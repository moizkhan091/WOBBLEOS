/**
 * Server-side URL safety (SSRF guard). Shared by source ingestion and the n8n outbound handoff so any
 * server-initiated fetch validates the target the same way: http(s) only, and never a loopback / private
 * / link-local / cloud-metadata address — checked on both the host literal AND every resolved IP (a public
 * domain pointing at a private IP is rejected). Residual: a DNS rebind between lookup and connect is not
 * covered here (a custom undici connect-dispatcher is the follow-up); the concrete internal-target and
 * redirect-to-metadata vectors ARE blocked.
 */

/** True for a loopback / private / link-local / reserved IP literal (v4 + common v6) — an SSRF target. */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  // IPv6 loopback / link-local / unique-local.
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("::ffff:")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0 || (a === 169 && b === 254)) return true;     // loopback / private / this-network / link-local (incl. cloud metadata 169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;                                  // 172.16/12
    if (a === 192 && b === 168) return true;                                           // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true;                                 // CGNAT 100.64/10
    if (a >= 224) return true;                                                          // multicast / reserved
  }
  return false;
}

/** Validate a URL is safe to fetch server-side: http(s) only + not an SSRF target (host literal + resolved IPs). */
export async function assertFetchableUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`invalid URL: ${raw}`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`blocked URL scheme '${u.protocol}' (only http/https)`);
  if (isBlockedHost(u.hostname)) throw new Error(`blocked internal host '${u.hostname}'`);
  // Resolve the hostname and reject if ANY address is internal (catches a public domain pointing at a private IP).
  try {
    const { lookup } = await import("node:dns/promises");
    const addrs = await lookup(u.hostname, { all: true });
    for (const a of addrs) if (isBlockedHost(a.address)) throw new Error(`blocked resolved address ${a.address} for ${u.hostname}`);
  } catch (e) {
    if (e instanceof Error && /blocked/.test(e.message)) throw e; // re-throw our SSRF rejection; ignore resolver errors (real fetch will surface them)
  }
  return u;
}
