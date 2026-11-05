import { createClient } from '@supabase/supabase-js';
import { authenticatedUser, fail } from '../../../../lib/server/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { client, user } = await authenticatedUser(request);
    const { password } = await request.json();
    if (typeof password !== 'string' || !password || !user.email) throw new Error('Введите текущий пароль');
    if (user.id === process.env.CONNECT_ADMIN_USER_ID) throw new Error('Удаление аккаунта администратора отключено во избежание потери управления');

    // Verify the password with a separate public client, preserving the admin client's session.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) throw new Error('Не настроен Supabase');
    const verifier = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: verified, error: passwordError } = await verifier.auth.signInWithPassword({ email: user.email, password });
    if (passwordError || verified.user?.id !== user.id) throw new Error('Неверный пароль');

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
