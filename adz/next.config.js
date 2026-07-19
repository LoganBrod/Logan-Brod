/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "@ffmpeg-installer/ffmpeg",
      "@ffprobe-installer/ffprobe",
    ],
  },
};

module.exports = nextConfig;
