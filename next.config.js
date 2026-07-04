/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Native-binary packages: resolved at runtime, must not be bundled
    serverComponentsExternalPackages: [
      "@ffmpeg-installer/ffmpeg",
      "@ffprobe-installer/ffprobe",
    ],
  },
};

module.exports = nextConfig;
