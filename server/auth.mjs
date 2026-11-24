import { createHmac, timingSafeEqual } from 'node:crypto';
import { demoRoles } from './seed.mjs';
import { clean, requireThat } from './orders.mjs';

const ttl = 60 * 60;
export const demoPassword = 'ScanServeDemo24!';

export function createAuth({ supabaseUrl, anonKey, demoSecret, fetcher = fetch }) {
  const sign = value => createHmac('sha256', demoSecret).update(value).digest('base64url');
  async function supabase(path, token, body) {
    requireThat(supabaseUrl && anonKey, 'Authentication is unavailable.', 503);
    return fetcher(supabaseUrl + '/auth/v1/' + path, {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { apikey: anonKey, ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  }
  return {
    async login(input, demo) {
      const email = clean(input.email, 254).toLowerCase();
      const password = typeof input.password === 'string' ? input.password : '';
      requireThat(email.includes('@') && password.length > 0 && password.length <= 256, 'Enter a valid email and password.');
      if (demo && demoSecret) {
        requireThat(Object.hasOwn(demoRoles, email) && password === demoPassword, 'Invalid credentials.', 401);
        const value = Buffer.from(JSON.stringify({ email, exp: Date.now() + ttl * 1000 })).toString('base64url');
        return { token: 'demo.' + value + '.' + sign(value), maxAge: ttl };
      }
      const response = await supabase('token?grant_type=password', null, { email, password });
      const data = await response.json();
      requireThat(response.ok && data.access_token, 'Sign-in failed. Check your credentials and email confirmation.', 401);
      return { token: data.access_token, maxAge: Number(data.expires_in) || ttl };
    },
    async register(input) {
      const email = clean(input.email, 254).toLowerCase();
      const password = typeof input.password === 'string' ? input.password : '';
      requireThat(email.includes('@') && password.length >= 10 && password.length <= 128, 'Use a valid email and a password of at least 10 characters.');
      const response = await supabase('signup', null, { email, password });
      requireThat(response.ok, 'Registration could not be completed.');
    },
    async user(token, demo) {
      if (!token) return null;
      if (token.startsWith('demo.')) {
        if (!demo || !demoSecret) return null;
        const [, value, signature, extra] = token.split('.');
        if (!value || !signature || extra) return null;
        const candidate = Buffer.from(signature);
        const expected = Buffer.from(sign(value));
        if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return null;
        const { email, exp } = JSON.parse(Buffer.from(value, 'base64url').toString());
        if (exp > Date.now() && Object.hasOwn(demoRoles, email)) return { id: email, role: demoRoles[email] };
        return null;
      }
      if (!supabaseUrl || !anonKey) return null;
      const response = await supabase('user', token);
      if (!response.ok) return null;
      const { id } = await response.json();
      return id ? { id } : null;
    }
  };
}
