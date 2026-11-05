import { createClient } from '@supabase/supabase-js';
import { authenticatedUser, fail } from '../../../../lib/server/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { client, user } = await authenticatedUser(request);
    const { password } = await request.json();
    if (typeof password !== 'string' || !password || !user.email) throw new Error('Введите текущий пароль');
    if (user.id === process.env.CONNECT_ADMIN_USER_ID) throw new Error('Удаление аккаунта администратора отключено во избежание потери управления');

    // Use a separate client for password verification. Signing in on the
    // service-role client would replace its admin session with a user session.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error('Не настроен Supabase');
    const verifier = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: verified, error: passwordError } = await verifier.auth.signInWithPassword({ email: user.email, password });
    if (passwordError || verified.user?.id !== user.id) throw new Error('Неверный пароль');

    // Retain the profile as a tombstone to preserve foreign-key references.
    const { error: profileError } = await client.from('profiles').update({
      display_name: 'Удалённый пользователь', bio: '', avatar_path: null,
      is_blocked: true, last_seen_at: null, online_until: null
    }).eq('id', user.id);
    if (profileError) throw profileError;

    const { error: deleteError } = await client.auth.admin.deleteUser(user.id);
    if (deleteError) {
      await client.from('profiles').update({ is_blocked: false }).eq('id', user.id);
      throw deleteError;
    }
    return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
