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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vuarau/domain-contracts"],
  async rewrites() {
    return [{ source: "/trpc/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
