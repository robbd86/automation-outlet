const API_VERSION = '2022-11-28';
const DEFAULT_REPO = 'robbd86/automation-outlet-site';
const LABEL = 'plc-audit-job';
const MARKER_RE = /<!-- AO_PLC_AUDIT_B64:([A-Za-z0-9+/=]+) -->/;

function settings() {
  return { token: process.env.AO_GITHUB_TOKEN, repo: process.env.AO_GITHUB_REPO || DEFAULT_REPO };
}

async function github(path, options = {}) {
  const { token, repo } = settings();
  if (!token) {
    const error = new Error('PLC audit database is not configured');
    error.status = 503;
    error.code = 'AUDIT_STORE_NOT_CONFIGURED';
    throw error;
  }
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'automation-outlet-plc-audit',
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `GitHub request failed (${response.status})`);
    error.status = response.status;
    error.code = 'AUDIT_STORE_ERROR';
    throw error;
  }
  return data;
}

function encode(data) { return Buffer.from(JSON.stringify(data), 'utf8').toString('base64'); }
function decode(body) {
  const match = String(body || '').match(MARKER_RE);
  if (!match) return null;
  try { return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')); } catch { return null; }
}

function render(job) {
  return `# AO PLC Intelligence ${job.id}\n\n- **Status:** ${job.status}\n- **Profile:** ${job.profile}\n- **Account:** ${job.accountId}\n- **Original filename:** ${job.filename}\n- **Storage pathname:** ${job.storagePath}\n- **Created:** ${job.createdAt}\n- **Delete after:** ${job.retention?.deleteAfter || 'Not set'}\n\nThis issue is a private Automation Outlet application record. PLC project bytes are stored separately in private object storage.\n\n<!-- AO_PLC_AUDIT_B64:${encode(job)} -->`;
}

async function listIssueRecords() {
  const records = [];
  for (let page = 1; page <= 10; page += 1) {
    const issues = await github(`/issues?state=all&labels=${encodeURIComponent(LABEL)}&per_page=100&page=${page}&sort=updated&direction=desc`);
    for (const issue of issues) {
      if (issue.pull_request) continue;
      const job = decode(issue.body);
      if (job?.id) records.push({ ...job, issueNumber: issue.number, issueState: issue.state });
    }
    if (issues.length < 100) break;
  }
  return records;
}

async function ensureAuditLabel() {
  const labels = await github('/labels?per_page=100');
  if (!labels.some((label) => label?.name === LABEL)) {
    await github('/labels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: LABEL, color: '2B7FFF', description: 'Private AO PLC Intelligence audit jobs' }) });
  }
}

export async function createAuditJobRecord(job) {
  await ensureAuditLabel();
  const issue = await github('/issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `[PLC Audit] ${job.id}`, body: render(job), labels: [LABEL] }),
  });
  return { ...job, issueNumber: issue.number, issueState: issue.state };
}

export async function getAuditJobRecord(id) {
  const records = await listIssueRecords();
  return records.find((job) => job.id === id) || null;
}

export async function listAuditJobRecordsForAccount(accountId) {
  const records = await listIssueRecords();
  return records.filter((job) => job.accountId === accountId && job.status !== 'DELETED');
}

export function isWorkerClaimable(job, now = Date.now()) {
  if (!job) return false;
  if (job.status === 'QUEUED') return true;
  if (job.status !== 'ANALYSING') return false;
  const leaseUntil = Date.parse(String(job.workerClaim?.leaseUntil || ''));
  return Number.isFinite(leaseUntil) && leaseUntil <= now;
}

export async function listClaimableAuditJobRecords(now = Date.now()) {
  const records = await listIssueRecords();
  return records.filter((job) => isWorkerClaimable(job, now));
}

// Kept for compatibility with any existing tooling while the worker protocol moves to leases.
export async function listQueuedAuditJobRecords() {
  const records = await listIssueRecords();
  return records.filter((job) => job.status === 'QUEUED');
}

export async function updateAuditJobRecord(job) {
  let issueNumber = job.issueNumber;
  if (!issueNumber) {
    const existing = await getAuditJobRecord(job.id);
    issueNumber = existing?.issueNumber;
  }
  if (!issueNumber) {
    const error = new Error('Audit job record not found');
    error.status = 404;
    error.code = 'AUDIT_NOT_FOUND';
    throw error;
  }
  const persisted = { ...job };
  delete persisted.issueNumber;
  delete persisted.issueState;
  const issue = await github(`/issues/${issueNumber}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `[PLC Audit] ${persisted.id}`, body: render(persisted), state: persisted.status === 'DELETED' ? 'closed' : 'open' }),
  });
  return { ...persisted, issueNumber: issue.number, issueState: issue.state };
}
