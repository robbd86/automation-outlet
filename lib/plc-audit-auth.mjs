import crypto from 'node:crypto';

export const PLC_SESSION_COOKIE = 'ao_plc_session';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function secret() {
  const value = String(process.env.AO_PLC_SESSION_SECRET || '').trim();
  if (value.length < 32) {
    const error = new Error('AO_PLC_SESSION_SECRET must be configured with at least 32 characters');
    error.status = 503;
    error.code = 'PLC_SESSION_NOT_CONFIGURED';
    throw error;
  }
  return value;
}

function sign(payloadPart) {
  return crypto.createHmac('sha256', secret()).update(payloadPart).digest('base64url');
}

export function issueSessionToken(accountId = `acct_${crypto.randomBytes(16).toString('hex')}`, now = Date.now()) {
  const ttlSeconds = Math.max(3600, Number.parseInt(process.env.AO_PLC_SESSION_TTL_SECONDS || '', 10) || DEFAULT_TTL_SECONDS);
  const payload = {
    v: 1,
    accountId,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttlSeconds,
  };
  const encoded = base64url(JSON.stringify(payload));
  return { token: `${encoded}.${sign(encoded)}`, payload };
}

export function verifySessionToken(token, now = Date.now()) {
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra) return null;
  let expected;
  try { expected = sign(encoded); } catch { return null; }
  if (!secureEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload?.v !== 1 || typeof payload.accountId !== 'string' || !payload.accountId.startsWith('acct_')) return null;
    if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(request) {
  const source = String(request?.headers?.cookie || '');
  return Object.fromEntries(source.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

export function readSession(request) {
  const token = parseCookies(request)[PLC_SESSION_COOKIE];
  const payload = verifySessionToken(token);
  return payload ? { accountId: payload.accountId, token } : null;
}

export function ensureSession(request, response) {
  const existing = readSession(request);
  if (existing) return existing;
  const issued = issueSessionToken();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${PLC_SESSION_COOKIE}=${encodeURIComponent(issued.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${issued.payload.exp - issued.payload.iat}${secure}`);
  return { accountId: issued.payload.accountId, token: issued.token };
}

export function requireSession(request) {
  const session = readSession(request);
  if (!session) {
    const error = new Error('Customer session required');
    error.status = 401;
    error.code = 'PLC_SESSION_REQUIRED';
    throw error;
  }
  return session;
}

export function authorizeJob(job, accountId) {
  if (!job || job.status === 'DELETED') {
    const error = new Error('Audit not found');
    error.status = 404;
    error.code = 'AUDIT_NOT_FOUND';
    throw error;
  }
  if (!accountId || job.accountId !== accountId) {
    const error = new Error('Audit not found');
    error.status = 404;
    error.code = 'AUDIT_NOT_FOUND';
    throw error;
  }
  return job;
}
