import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js parses the wire protocol with raw Buffers. Bundling it corrupts
  // reads of larger rows ("The value of 'offset' is out of range"), so load it
  // from node_modules at runtime instead. transformers.js is excluded for the
  // same reason — it ships native/WASM ONNX runtime assets.
  serverExternalPackages: ["postgres", "@huggingface/transformers"],
};

export default nextConfig;
