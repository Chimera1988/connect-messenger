/** Next.js server runtime required for /api/push routes. */
const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://tpwkmoxxzjfdsqsomhhr.supabase.co';
const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_tAg8rPwuBNcA2iPF7voc2Q_vsKUpyZa';
const nextConfig = {
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: '/supabase/:path*', destination:supabaseUrl+'/:path*' },
      { source: '/supabase-storage/:path*', destination:supabaseUrl.replace('.supabase.co','.storage.supabase.co')+'/:path*' },
    ];
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL:supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:supabaseKey,
  },
};
export default nextConfig;
