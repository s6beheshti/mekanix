import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // In production, strip dev-only endpoints via rewrites.
  // The /api/auth/demo endpoint returns 404 at the handler level too,
  // but this rewrite ensures it never even reaches the handler.
  ...(isProduction
    ? {
        async rewrites() {
          return [
            {
              source: "/api/auth/demo",
              destination: "/404",
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
