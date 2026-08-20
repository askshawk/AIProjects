import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js parses the wire protocol with raw Buffers. Bundling it corrupts
  // reads of larger rows ("The value of 'offset' is out of range"), so load it
  // from node_modules at runtime instead.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
