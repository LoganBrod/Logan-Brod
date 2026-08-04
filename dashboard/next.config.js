const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app reads memory/ from the parent directory at runtime, which is
  // outside the Next.js project root. Next warns unless told the root.
  outputFileTracingRoot: path.join(__dirname, ".."),

  experimental: {
    // Whisper runs in the Node process, never in the browser bundle. Listing
    // it here tells Next to require() it natively at runtime instead of
    // bundling it — which is what we want, because the package ships prebuilt
    // native .node binaries that webpack cannot parse as JavaScript.
    serverComponentsExternalPackages: ["@huggingface/transformers"],
  },
};

module.exports = nextConfig;
