import withSerwistInit from "@serwist/next";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const revisionFr = process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID();
const revisionEn = process.env.VERCEL_GIT_COMMIT_SHA
  ? `${process.env.VERCEL_GIT_COMMIT_SHA}-en`
  : crypto.randomUUID();

const nextConfig: NextConfig = {
  /* config options here */
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [
    { url: "/fr/~offline", revision: revisionFr },
    { url: "/en/~offline", revision: revisionEn },
  ],
});

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
export default withSerwist(withNextIntl(nextConfig));
