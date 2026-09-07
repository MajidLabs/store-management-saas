/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    // Product images are served by the API container (LocalDiskStorageProvider,
    // see ARCHITECTURE.md section 10), not by Next.js's own image optimizer.
    remotePatterns: [
      { protocol: "http", hostname: "**" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
