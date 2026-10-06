import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  // node_modules live one level up, in school-os/.
  turbopack: { root: path.join(__dirname, "..") },
  outputFileTracingRoot: path.join(__dirname, ".."),
};
export default config;
