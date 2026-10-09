// Local integration fixture: real website handler/service/store/Blob signing;
// in-memory GitHub and Blob transport. Never contacts external services.
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import plcAuditHandler from '../../lib/plc-audit-handler.mjs';

process.env.AO_GITHUB_TOKEN = 'local-github-token';
process.env.AO_GITHUB_REPO = 'local/test';
process.env.AO_PLC_WORKER_KEY = 'local-worker-test-key';
process.env.AO_PLC_SESSION_SECRET = 'local-session-test-secret-at-least-32-characters';
process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_local_test';
process.env.AO_PLC_ANALYSIS_ADAPTER = 'worker';
const signingSecret = 'local-blob-signing-key';
const issues = [];
const objects = new Map();
let downloads = 0;
globalThis.fetch = async (value, options = {}) => {
  const url = new URL(value);
  if (url.hostname === 'api.github.com') {
    assert.equal(options.headers.Authorization, 'Bearer local-github-token');
    if (url.pathname.endsWith('/labels')) return Response.json([{ name: 'plc-audit-job' }]);
    const number = Number(url.pathname.split('/').at(-1));
    if (options.method === 'POST') {
      const issue = { ...JSON.parse(options.body), number: issues.length + 1, state: 'open' };
      issues.push(issue);
      return Response.json(issue);
    }
    if (options.method === 'PATCH') {
      Object.assign(issues[number - 1], JSON.parse(options.body));
      return Response.json(issues[number - 1]);
    }
    return Response.json(number ? issues[number - 1] : issues);
  }
  if (url.href === 'https://vercel.com/api/blob/signed-token') {
    assert.equal(options.headers.authorization, 'Bearer vercel_blob_rw_local_test');
    const scope = { storeId: 'store_local', ...JSON.parse(options.body) };
    return Response.json({ delegationToken: `${Buffer.from(JSON.stringify(scope)).toString('base64url')}.local-server-signature`, clientSigningToken: signingSecret });
  }
  throw new Error('External network is disabled in the local integration fixture');
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (url.pathname === '/__blob') {
      assert.equal(request.headers['x-plc-worker-key'], undefined, 'Worker key must never reach Blob');
      const delegation = url.searchParams.get('vercel-blob-delegation');
      const scope = JSON.parse(Buffer.from(delegation.split('.')[0], 'base64url'));
      const operation = request.method === 'PUT' ? 'put' : 'get';
      assert.ok(scope.operations.includes(operation));
      assert.ok(scope.validUntil > Date.now());
      const entries = [`operation=${operation}`, `pathname=${scope.pathname}`];
      for (const key of ['vercel-blob-allowed-content-types', 'vercel-blob-maximum-size-in-bytes']) {
        if (url.searchParams.has(key)) entries.push(`${key}=${url.searchParams.get(key)}`);
      }
      entries.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
      const signature = crypto.createHmac('sha256', signingSecret).update(entries.join('\n')).digest('base64url');
      assert.equal(url.searchParams.get('vercel-blob-signature'), signature);
      if (operation === 'put') {
        assert.ok(body.length <= scope.maximumSizeInBytes);
        objects.set(scope.pathname, body);
        response.writeHead(200).end('{}');
      } else {
        downloads += 1;
        const data = objects.get(scope.pathname);
        assert.ok(data);
        response.writeHead(200, { 'Content-Length': data.length }).end(data);
      }
      return;
    }
    if (url.pathname === '/__state') {
      const jobs = issues.map(issue => JSON.parse(Buffer.from(issue.body.match(/AO_PLC_AUDIT_B64:([A-Za-z0-9+/=]+)/)[1], 'base64')));
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jobs, downloads }));
      return;
    }
    assert.equal(url.pathname, '/api/plc-audit');
    request.query = Object.fromEntries(url.searchParams);
    request.body = body.length ? JSON.parse(body) : undefined;
    response.status = status => { response.statusCode = status; return response; };
    response.json = value => {
      // Only the signed Blob URL's authority/path changes for loopback transport.
      if (value.work?.projectDownload) {
        const original = new URL(value.work.projectDownload.url);
        value.work.projectDownload.url = `http://${request.headers.host}/__blob${original.search}`;
      }
      response.end(JSON.stringify(value));
    };
    await plcAuditHandler(request, response);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }));
  }
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ origin: `http://127.0.0.1:${server.address().port}` })));
