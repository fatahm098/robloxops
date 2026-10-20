/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

/**
 * Security headers applied to every response.
 *
 * The CSP here is deliberately narrow in scope: it only locks down framing,
 * plugins and base-uri, which cannot break script or style loading. A full
 * script-src policy would need nonces threaded through the App Router.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

if (isProd) {
  // Only meaningful over HTTPS; browsers ignore it on plain HTTP.
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: false,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
