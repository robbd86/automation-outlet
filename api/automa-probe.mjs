// TEMPORARY / Preview-only. Read-only Automa.Net supplier inventory smoke test.
// Does not upload inventory, send RFQs or place orders.
const TEST_PARTS = [
  { brand: 'Siemens', partNumber: '6ES7315-2AG10-0AB0' },
  { brand: 'Allen-Bradley', partNumber: '1756-L71' },
  { brand: 'Siemens', partNumber: '6SL3210-1PE21-1UL0' },
];
const API_ORIGIN = 'https://integration-api.automa.net';
function finiteText(value,max=300) {
  return typeof value === 'string' ? value.slice(0,max) : value;
}
function summariseResult(payload) {
  if (!payload || typeof payload !== 'object') return {type: typeof payload, value: finiteText(payload)};
  const output = { fields: Object.keys(payload).slice(0,18) };
  for (const [key,value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      output[key] = {count:value.length, samples:value.slice(0,2).map(item => {
        if (item === null || typeof item !== 'object') return finiteText(item);
        // Keep diagnostic keys rather than exposing supplier contacts and prices.
        return {fields:Object.keys(item).slice(0,25)};
      })};
    } else if (value !== null && typeof value === 'object') {
      output[key] = { fields:Object.keys(value).slice(0,24) };
      for (const [subKey,subVal] of Object.entries(value)) {
        if (Array.isArray(subVal)) output[key][subKey] = {count:subVal.length};
        if (/count|total|pages|quantity/i.test(subKey) && typeof subVal === 'number') output[key][subKey] = subVal;
      }
    } else if (/count|total|pages|success|status/i.test(key) && ['number','boolean','string'].includes(typeof value)) {
      output[key] = finiteText(value);
    }
  }
  return output;
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({error:'Preview only'});
  const apiKey = process.env.AUTOMA_NET_API_KEY;
  if (!apiKey) return res.status(503).json({error:'Preview API credential missing'});
  // Fixed read-only test inputs: no general-purpose unauthenticated API proxy.
  const results = [];
  for (const part of TEST_PARTS) {
    const url = new URL('/ext/api/v1/inventory',API_ORIGIN);
    url.searchParams.set('phrase',part.partNumber);
    try {
      const upstream = await fetch(url,{
        method:'GET',
        headers: {Authorization:apiKey, Accept:'application/json'},
        signal: AbortSignal.timeout(12000),
        cache:'no-store'
      });
      const text = await upstream.text();
      let json=null;
      try { json=JSON.parse(text); } catch {}
      results.push({
        ...part,
        httpStatus:upstream.status,
        result: json ? summariseResult(json) : {contentType:upstream.headers.get('content-type'),responseLength:text.length},
        error: !upstream.ok ? finiteText(json?.message || json?.error || text.slice(0,160),160) : undefined
      });
      // Stop early if the account isn't authorised, avoiding unnecessary calls.
      if (upstream.status === 401 || upstream.status === 403 || upstream.status === 402 || upstream.status === 429) break;
    } catch(e) {
      results.push({...part,error:e?.name === 'TimeoutError' ? 'Upstream timeout' : 'Upstream connection failed'});
      break;
    }
  }
  return res.status(200).json({mode:'preview-read-only',endpoint:'/ext/api/v1/inventory',results});
}
