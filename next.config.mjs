/** Cloudflare static export. Keep Vercel's existing configuration separate. */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
};
export default nextConfig;
