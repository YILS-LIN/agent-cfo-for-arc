import type { NextConfig } from "next";

import { buildSecurityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(process.env.NODE_ENV === "production"),
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/reports/[reportId]/pdf": [
      "./node_modules/@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf",
    ],
  },
};

export default nextConfig;
