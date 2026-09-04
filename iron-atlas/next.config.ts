import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js parses the wire protocol with raw Buffers. Bundling it corrupts
  // reads of larger rows ("The value of 'offset' is out of range"), so load it
  // from node_modules at runtime instead.
  serverExternalPackages: ["postgres"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Sign-in and set-logging live behind session cookies — force
          // HTTPS on every response so a cookie marked `secure` (see
          // auth.ts) is never sent over a plain-HTTP connection that got
          // this far by accident.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
