import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js parses the wire protocol with raw Buffers. Bundling it corrupts
  // reads of larger rows, so load it from node_modules at runtime instead
  // (same fix as iron-atlas).
  serverExternalPackages: ["postgres"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The session cookie is marked `secure` in production; never let a
          // plain-HTTP request carry it.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // The browser must always fetch the latest worker, or a bad one could
        // stick around for days.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
