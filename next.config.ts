import type { NextConfig } from "next";

/**
 * Security response headers (WOB-AUD-012). Defense-in-depth at the app layer so the app is not
 * dependent on a correctly-configured reverse proxy for baseline browser hardening. HSTS is set at
 * the TLS-terminating reverse proxy (see docs/VPS_DEPLOYMENT.md) once HTTPS is confirmed — it is
 * intentionally NOT emitted here because the app is served over plain HTTP behind the proxy.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    // Conservative CSP: same-origin by default; allow inline styles (Next injects them) and data/blob
    // images (media previews). No third-party script origins are needed by the app shell.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "font-src 'self' data:",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Playwright (used ONLY server-side to rasterise HTML carousel slides) is a heavy native package that must
  // not be bundled into the standalone trace — it's require()'d at runtime, and the render path falls back to
  // the image model if it (or chromium) is absent.
  // `@playwright/test` and `chromium-bidi` must be listed too: documents/pdf.ts probes all three
  // specifiers at runtime, and without them the bundler follows @playwright/test -> playwright-core ->
  // chromium-bidi and fails the production build on a devDependency that is never bundled anyway.
  serverExternalPackages: ["playwright", "playwright-core", "@playwright/test", "chromium-bidi"],
  // Standalone output → a self-contained server bundle for the isolated Docker/VPS deploy (small runtime image).
  output: "standalone",
  // Pin the file-tracing root to this project and EXCLUDE non-runtime trees from the standalone trace.
  // Without this, the dynamic `fs.readFile` in src/lib/library/media-serve.ts causes Next's tracer to
  // pull broad repository content (and, when present in the context, machine-local storage) into
  // `.next/standalone` (WOB-AUD-002). The build context (.dockerignore) already excludes these, and
  // this keeps the trace itself minimal and warning-free.
  outputFileTracingRoot: import.meta.dirname,
  outputFileTracingExcludes: {
    "*": [
      "storage/**",
      "docs/**",
      "e2e/**",
      "tests/**",
      "logs/**",
      "output/**",
      "**/*.md",
      "**/*.zip",
      "ai os youtubevideos/**",
      "dashboard-interface-design-brief/**",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
