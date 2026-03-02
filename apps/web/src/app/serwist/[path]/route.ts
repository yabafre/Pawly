import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ??
  crypto.randomUUID();

const revisionEn = `${revision}-en`;

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [
    { url: "/fr/~offline", revision },
    { url: "/en/~offline", revision: revisionEn },
  ],
  swSrc: "src/app/sw.ts",
  nextConfig: {},
});
