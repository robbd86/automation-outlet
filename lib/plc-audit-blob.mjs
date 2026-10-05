import crypto from 'node:crypto';

const BLOB_API = process.env.VERCEL_BLOB_API_URL || 'https://vercel.com/api/blob';
const BLOB_API_VERSION = '12';

const PRESIGN = Object.freeze({
  allowedContentTypes: 'vercel-blob-allowed-content-types',
  maximumSizeInBytes: 'vercel-blob-maximum-size-in-bytes',
});

function blobError(message, status = 503, code = 'BLOB_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function readWriteToken() {
  const token = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!token) throw blobError('Private Blob storage is not configured', 503, 'BLOB_NOT_CONFIGURED');
  return token;
}

function storeIdFromReadWriteToken(token) {
  const parts = String(token || '').split('_');
  const storeId = parts[3] || '';
  if (!storeId) throw blobError('Could not resolve Vercel Blob store ID', 503, 'BLOB_STORE_INVALID');
  return storeId;
}

function decodeDelegation(token) {
  const dot = String(token || '').indexOf('.');
  if (dot < 0) throw blobError('Invalid Blob delegation token', 500, 'BLOB_DELEGATION_INVALID');
  try {
    return JSON.parse(Buffer.from(token.slice(0, dot), 'base64url').toString('utf8'));
  } catch {
    throw blobError('Invalid Blob delegation payload', 500, 'BLOB_DELEGATION_INVALID');
  }
}

function storeIdFromIssued(issued) {
  const storeId = String(decodeDelegation(issued.delegationToken).storeId || '').replace(/^store_/, '');
  if (!storeId) throw blobError('Blob delegation does not identify a store', 500, 'BLOB_STORE_INVALID');
  return storeId;
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function canonicalString(pathname, operation, entries = []) {
  return [`operation=${operation}`, `pathname=${pathname}`, ...entries.map(([key, value]) => `${key}=${value}`)]
    .sort(compareUtf8)
    .join('\n');
}

function putConstraintEntries(scope, { allowedContentTypes, maximumSizeInBytes } = {}) {
  const entries = [];
  if (allowedContentTypes?.length) {
    const requested = [...allowedContentTypes].sort(compareUtf8);
    const delegated = Array.isArray(scope.allowedContentTypes) ? scope.allowedContentTypes : [];
    if (delegated.length && requested.some((type) => !delegated.includes(type))) {
      throw blobError('Blob content type is outside the signed delegation scope', 403, 'BLOB_SCOPE_MISMATCH');
    }
    entries.push([PRESIGN.allowedContentTypes, requested.join(',')]);
  }
  if (maximumSizeInBytes !== undefined) {
    const maximum = Number(maximumSizeInBytes);
    if (!Number.isFinite(maximum) || maximum <= 0) {
      throw blobError('Invalid Blob maximum upload size', 400, 'BLOB_SCOPE_INVALID');
    }
    if (Number.isFinite(scope.maximumSizeInBytes) && maximum > scope.maximumSizeInBytes) {
      throw blobError('Blob maximum upload size is outside the signed delegation scope', 403, 'BLOB_SCOPE_MISMATCH');
    }
    entries.push([PRESIGN.maximumSizeInBytes, String(Math.trunc(maximum))]);
  }
  return entries;
}

function addSignedParams(url, issued, pathname, operation, { now = Date.now(), allowedContentTypes, maximumSizeInBytes } = {}) {
  const scope = decodeDelegation(issued.delegationToken);
  if (scope.pathname && scope.pathname !== '*' && scope.pathname !== pathname) {
    throw blobError('Blob permission does not match this pathname', 403, 'BLOB_SCOPE_MISMATCH');
  }
  if (!Array.isArray(scope.operations) || !scope.operations.includes(operation)) {
    throw blobError(`Blob permission does not allow ${operation}`, 403, 'BLOB_OPERATION_DENIED');
  }
  if (!Number.isFinite(scope.validUntil) || scope.validUntil <= now) {
    throw blobError('Blob upload permission has expired', 403, 'BLOB_PERMISSION_EXPIRED');
  }

  const entries = operation === 'put'
    ? putConstraintEntries(scope, { allowedContentTypes, maximumSizeInBytes })
    : [];
  const signature = crypto
    .createHmac('sha256', String(issued.clientSigningToken))
    .update(canonicalString(pathname, operation, entries))
    .digest('base64url');

  const target = new URL(url);
  for (const [key, value] of entries) target.searchParams.set(key, value);
  target.searchParams.set('vercel-blob-delegation', issued.delegationToken);
  target.searchParams.set('vercel-blob-signature', signature);
  return target.toString();
}

export async function issueSignedToken({ pathname, operations, validUntil, maximumSizeInBytes, allowedContentTypes }) {
  const token = readWriteToken();
  const storeId = storeIdFromReadWriteToken(token);
  const response = await fetch(`${BLOB_API}/signed-token`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-vercel-blob-store-id': storeId,
      'x-api-version': BLOB_API_VERSION,
    },
    body: JSON.stringify({ pathname, operations, validUntil, maximumSizeInBytes, allowedContentTypes }),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.delegationToken || !payload.clientSigningToken) {
    throw blobError(payload?.error?.message || `Could not issue Blob permission (${response.status})`, 502, 'BLOB_PERMISSION_FAILED');
  }
  return payload;
}

export function presignIssuedPermission(issued, { pathname, operation, now = Date.now(), allowedContentTypes, maximumSizeInBytes }) {
  const storeId = storeIdFromIssued(issued);
  if (operation === 'put' || operation === 'delete') {
    const url = `${BLOB_API}/?pathname=${encodeURIComponent(pathname)}`;
    return addSignedParams(url, issued, pathname, operation, { now, allowedContentTypes, maximumSizeInBytes });
  }
  if (operation === 'get' || operation === 'head') {
    const encodedPath = pathname.split('/').map(encodeURIComponent).join('/');
    const url = `https://${storeId}.private.blob.vercel-storage.com/${encodedPath}`;
    return addSignedParams(url, issued, pathname, operation, { now });
  }
  throw blobError('Unsupported Blob operation', 400, 'BLOB_OPERATION_INVALID');
}

export async function createUploadPermission({ pathname, maximumSizeInBytes, contentType, validForMs = 10 * 60 * 1000 }) {
  const validUntil = Date.now() + validForMs;
  const allowedContentTypes = [contentType];
  const issued = await issueSignedToken({
    pathname,
    operations: ['put'],
    validUntil,
    maximumSizeInBytes,
    allowedContentTypes,
  });
  const storeId = storeIdFromIssued(issued);
  return {
    url: presignIssuedPermission(issued, {
      pathname,
      operation: 'put',
      maximumSizeInBytes,
      allowedContentTypes,
    }),
    expiresAt: new Date(validUntil).toISOString(),
    headers: {
      'content-type': contentType,
      'x-content-type': contentType,
      'x-vercel-blob-access': 'private',
      'x-vercel-blob-store-id': storeId,
      'x-api-version': BLOB_API_VERSION,
    },
  };
}

export async function createReadPermission(pathname, validForMs = 5 * 60 * 1000) {
  const validUntil = Date.now() + validForMs;
  const issued = await issueSignedToken({ pathname, operations: ['get'], validUntil });
  return {
    url: presignIssuedPermission(issued, { pathname, operation: 'get' }),
    expiresAt: new Date(validUntil).toISOString(),
  };
}

export async function deletePrivateObject(pathname) {
  const validUntil = Date.now() + 2 * 60 * 1000;
  const issued = await issueSignedToken({ pathname, operations: ['delete'], validUntil });
  const storeId = storeIdFromIssued(issued);
  const url = presignIssuedPermission(issued, { pathname, operation: 'delete' });
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'x-vercel-blob-store-id': storeId,
      'x-api-version': BLOB_API_VERSION,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok && response.status !== 404) {
    throw blobError(`Could not delete private Blob object (${response.status})`, 502, 'BLOB_DELETE_FAILED');
  }
  return true;
}
