/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this project so Turbopack resolves
  // `tailwindcss` from ./node_modules instead of walking up to ~.
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "youtube.com",
        port: "",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

module.exports = nextConfig;
