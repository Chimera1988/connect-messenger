import { createClient } from '@supabase/supabase-js';
import { authenticatedUser,fail,requireRateLimit } from '../../../../lib/server/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { client, user } = await authenticatedUser(request);
    await requireRateLimit(client,user.id,'account-delete',3,3600);
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

    // The Auth BEFORE DELETE trigger performs anonymization in the same DB
    // transaction. Auth failure leaves profile, history and permissions intact.
    await verifier.auth.signOut({scope:'local'});
    const {error:deleteError}=await client.auth.admin.deleteUser(user.id);
    if(deleteError)throw deleteError;
    return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
