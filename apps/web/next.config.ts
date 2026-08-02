import type { NextConfig } from "next";

/**
 * `@vuarau/domain-contracts` is workspace source, not a published build, so Next
 * has to compile it like application code. That is deliberate: the contracts
 * package is the one thing the browser and the server must agree on exactly, and
 * shipping it as source removes the chance of a stale build being the version the
 * UI validates against.
 *
 * The rewrite gives the browser a **same-origin** `/trpc` path. Cross-origin would
 * mean a CORS policy on the API, and a CORS policy written before there is a
 * deployment to write it for is a guess that gets copied into production. The API
 * has none today, and this is why it does not need one yet.
 */
const apiOrigin = process.env["NEXT_PUBLIC_API_ORIGIN"] ?? "http://localhost:3000";
const distDir = process.env["NEXT_DIST_DIR"] ?? ".next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir,
  transpilePackages: ["@vuarau/domain-contracts"],
  /*
   * The dev badge sits bottom-left, which on a phone viewport is exactly where
   * the sticky action bar puts "Bỏ đơn" — so in development it covers a real
   * control, and an end-to-end test cannot click through it.
   *
   * This hides the badge only. The dev error overlay still appears, so a runtime
   * error is as loud as it was.
   */
  devIndicators: false,
  async rewrites() {
    return [
      { source: "/trpc/:path*", destination: `${apiOrigin}/:path*` },
      {
        source: "/shared/documents/:token",
        destination: `${apiOrigin}/public/documents/:token`,
      },
    ];
  },
};

export default nextConfig;
