import { authenticatedUser, fail } from '../../../../lib/server/admin';
export const runtime = 'nodejs';
const PUBLIC_ORIGIN = 'https://connect-chat.duckdns.org';
async function check(request: Request) {
  const { client, user } = await authenticatedUser(request);
  const adminId = process.env.CONNECT_ADMIN_USER_ID;
  if (!adminId) throw new Error('Настройте CONNECT_ADMIN_USER_ID в Vercel');
  return { client, admin: user.id === adminId };
}
export async function GET(request: Request) {
  try { const { admin } = await check(request); return Response.json({ admin }); }
  catch (e) { return fail(e); }
}
export async function POST(request: Request) {
  try {
    const { client, admin } = await check(request);
    if (!admin) return Response.json({ error: 'Только администратор может приглашать' }, { status: 403 });
    const { email } = await request.json();
    if (typeof email !== 'string' || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Введите корректный email');
    const { data, error } = await client.auth.admin.generateLink({
      type: 'invite', email: email.trim().toLowerCase(),
      options: { redirectTo: PUBLIC_ORIGIN + '/' },
    });
    if (error || !data.properties?.action_link) throw new Error(error?.message || 'Не удалось создать приглашение');
    // Keep the verification request on Connect's own origin. next.config.mjs
    // already rewrites /supabase/* to the Supabase API server-side.
    const original = new URL(data.properties.action_link);
    if (original.hostname !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname) {
      throw new Error('Неожиданный адрес сервера приглашений');
    }
    const link = new URL('/supabase' + original.pathname + original.search, PUBLIC_ORIGIN);
    link.searchParams.set('redirect_to', PUBLIC_ORIGIN + '/');
    return Response.json({ link: link.toString() });
  } catch (e) { return fail(e); }
}
