/** Next.js server runtime required for /api/push routes. */
const nextConfig = {
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://tpwkmoxxzjfdsqsomhhr.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_tAg8rPwuBNcA2iPF7voc2Q_vsKUpyZa',
  },
};
export default nextConfig;
