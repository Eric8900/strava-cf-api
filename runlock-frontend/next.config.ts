import type { NextConfig } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL;

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    // If not set, disable the rewrite to avoid "undefined/api/:path*"
    if (!API_BASE) {
      console.warn(
        "[rewrites] NEXT_PUBLIC_API_BASE not set. Skipping API proxy rewrites."
      );
      return [];
    }

    // Must be absolute URL for cross-origin proxying
    if (!/^https?:\/\//.test(API_BASE)) {
      throw new Error(
        'NEXT_PUBLIC_API_BASE must be an absolute URL'
      );
    }

    return [
      {
        source: `${FRONTEND_URL}/api/:path*`,
        destination: `${API_BASE}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
