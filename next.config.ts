import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/dola/fetch": ["./src/lib/vendor/webmssdk_*.js"],
  },
};

export default nextConfig;
