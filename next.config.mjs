// Next.js inlines missing env vars as "" in the server bundle. next-auth then
// does `new URL("")` and prerender fails on Vercel with ERR_INVALID_URL.
const nextAuthUrl =
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

process.env.NEXTAUTH_URL = nextAuthUrl;

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXTAUTH_URL: nextAuthUrl,
    DEMO_MODE: process.env.DEMO_MODE ?? "",
  },
};

export default nextConfig;
