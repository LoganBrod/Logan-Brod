/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app reads memory/ from the parent directory at runtime, which is
  // outside the Next.js project root. Next warns about that unless told the
  // workspace root explicitly.
  outputFileTracingRoot: require("path").join(__dirname, ".."),
};

module.exports = nextConfig;
