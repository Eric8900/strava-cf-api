import type { NextConfig } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE; 

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
