import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // News posts can carry up to 5 files of 5 MB each (lib/news-files.ts).
  experimental: { serverActions: { bodySizeLimit: "26mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
