import crypto from 'node:crypto';

export const JWT_SECRET = process.env.JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

export function signJwt(payload) {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${body}.${crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url')}`;
}

export const ANON_KEY = signJwt({ role: 'anon', iss: 'supabase', iat: 1700000000, exp: 2000000000 });
