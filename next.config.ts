import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/dola/sign": ["./src/lib/vendor/webmssdk_*.js"],
    "/api/dola/fetch": ["./src/lib/vendor/webmssdk_*.js"],
  },
};

export default nextConfig;
