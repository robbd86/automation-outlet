import { ensureSession, requireSession, authorizeJob } from './plc-audit-auth.mjs';
import { confirmUpload, createReportDownload, createUploadJob, deleteCustomerAudit, getCustomerAudit, getNextWorkerJob, listCustomerAudits, publishWorkerResult, runMockAnalysis } from './plc-audit-service.mjs';
import { getAuditJobRecord } from './plc-audit-store.mjs';

function json(response, status, body) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.status(status).json(body);
}

function clean(value, max = 1000) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, max);
}

export function originAllowed(request) {
  const origin = clean(request?.headers?.origin, 500);
  if (!origin) return true;

  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const requestHosts = [request?.headers?.host, request?.headers?.['x-forwarded-host']]
    .map((value) => clean(value, 500).toLowerCase())
    .filter(Boolean);
  if (requestHosts.includes(originUrl.host.toLowerCase())) return true;

  const configured = clean(process.env.AO_ALLOWED_ORIGIN, 2000)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const defaults = ['https://automation-outlet.co.uk', 'https://www.automation-outlet.co.uk'];
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    const value = clean(host, 500);
    if (value) defaults.push(`https://${value}`);
  }

  if (process.env.VERCEL_ENV === 'preview' && originUrl.protocol === 'https:' && originUrl.hostname.endsWith('.vercel.app')) {
    return true;
  }

  return [...configured, ...defaults].includes(origin);
}

async function body(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');
  return {};
}

export default async function plcAuditHandler(request, response) {
  if (!originAllowed(request)) return json(response, 403, { error: 'Origin not allowed' });
  const action = String(request.query?.action || '').trim();
  try {
    if (request.method === 'POST' && action === 'create-upload') {
      const session = ensureSession(request, response);
      const result = await createUploadJob({ accountId: session.accountId, input: await body(request) });
      return json(response, 201, result);
    }
    if (request.method === 'POST' && action === 'confirm-upload') {
      const session = requireSession(request);
      return json(response, 200, { job: await confirmUpload({ accountId: session.accountId, id: (await body(request)).id }) });
    }
    if (request.method === 'GET' && action === 'list') {
      const session = ensureSession(request, response);
      return json(response, 200, { audits: await listCustomerAudits(session.accountId) });
    }
    if (request.method === 'GET' && action === 'get') {
      const session = requireSession(request);
      return json(response, 200, { audit: await getCustomerAudit(session.accountId, request.query?.id) });
    }
    if (request.method === 'DELETE' && action === 'delete') {
      const session = requireSession(request);
      return json(response, 200, await deleteCustomerAudit(session.accountId, request.query?.id));
    }
    if (request.method === 'POST' && action === 'mock-analyse') {
      if (String(process.env.AO_PLC_ANALYSIS_ADAPTER || '').toLowerCase() !== 'mock') return json(response, 404, { error: 'Not available' });
      const session = requireSession(request);
      const data = await body(request);
      const job = authorizeJob(await getAuditJobRecord(data.id), session.accountId);
      return json(response, 200, { job: await runMockAnalysis(job) });
    }
    if (request.method === 'GET' && action === 'report-url') {
      const session = requireSession(request);
      return json(response, 200, await createReportDownload(session.accountId, request.query?.id));
    }
    if (request.method === 'GET' && action === 'worker-next') {
      return json(response, 200, { work: await getNextWorkerJob(request.headers['x-plc-worker-key']) });
    }
    if (request.method === 'POST' && action === 'worker-update') {
      return json(response, 200, { job: await publishWorkerResult(request.headers['x-plc-worker-key'], await body(request)) });
    }
    return json(response, 404, { error: 'Unknown PLC audit action' });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json(response, status, { error: error?.message || 'PLC audit request failed', code: error?.code || 'PLC_AUDIT_ERROR' });
  }
}
