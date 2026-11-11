import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
];

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile in a parent directory is never picked up.
  turbopack: { root: import.meta.dirname },
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "pg"],
  images: {
    qualities: [70, 85],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // Listing and condition photographs (up to 8 MB each) are uploaded through Server Actions.
    serverActions: { bodySizeLimit: "9mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
