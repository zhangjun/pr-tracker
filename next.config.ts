import type { NextConfig } from "next";

// GitHub Pages serves a project site from /<repo>/, so every asset URL and the
// data fetch must carry that prefix. The deploy workflow sets this to the repo
// name; leaving it unset keeps local dev, Vercel and user/org pages
// (<user>.github.io, served from the root) working unchanged.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Emit a self-contained `out/` directory instead of a Node server. This is
  // what makes the site hostable on Pages at all: there is no runtime to run
  // `next start`. The app is already fully client-side (one client component
  // fetching a JSON file), so nothing depends on server rendering.
  output: "export",

  // Empty string must become undefined — Next treats "" as a prefix it tries
  // to resolve, and `basePath: ""` is not the same as "no base path".
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,

  // A static host has no Image Optimization endpoint. Nothing uses next/image
  // today; this keeps a future one from failing the build instead of the page.
  images: { unoptimized: true },

  // Static hosts resolve /pr-tracker/ to /pr-tracker/index.html, but not
  // /pr-tracker to the same file without a server-side redirect.
  trailingSlash: true,
};

export default nextConfig;
