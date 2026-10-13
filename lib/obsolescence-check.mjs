// AO obsolescence Quick Check — preview-first buyer enquiries.
// The lifecycle and successor details are NEVER inferred in this endpoint.
import { randomUUID, createHmac } from "node:crypto";

const URGENCIES = ["Planning ahead", "Spare needed soon", "Machine is down now"];
const INTENTS = ["Check lifecycle", "Source a spare", "Plan critical spares"];
const MANUFACTURERS = ["Siemens", "Allen-Bradley", "Omron", "Mitsubishi", "Other", "Not sure"];
const clean = (v, max=200) => String(v ?? "").replace(/\0/g, "").trim().slice(0, max);
const json = (res, status, obj) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(obj);
};
export function normaliseQuickCheck(body) {
  const b = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const rawParts = Array.isArray(b.parts) ? b.parts : [];
  return {
    parts: rawParts.map(p => ({
      code: clean(p?.code, 80).toUpperCase().replace(/\s+/g, " "),
      manufacturer: MANUFACTURERS.includes(p?.manufacturer) ? p.manufacturer : "Not sure",
      quantity: p?.quantity === "" || p?.quantity == null ? null : Number(p?.quantity)
    })),
    name: clean(b.name, 81),
    company: clean(b.company, 121),
    email: clean(b.email, 201).toLowerCase(),
    phone: clean(b.phone, 51),
    machine: clean(b.machine, 121),
    urgency: clean(b.urgency, 80),
    intent: clean(b.intent, 80),
    processingConsent: b.processingConsent === true,
    marketingConsent: b.marketingConsent === true,
    website: clean(b.website, 250),
    sourcePage: clean(b.sourcePage, 150),
    utmCampaign: clean(b.utmCampaign, 100)
  };
}
export function validateQuickCheck(p) {
  if (p.parts.length < 1 || p.parts.length > 5) return "Enter between 1 and 5 part numbers. For larger lists, request an audit.";
  const seen = new Set();
  for (const row of p.parts) {
    if (!/^[A-Z0-9 .+/-]{4,40}$/.test(row.code)) return "Part numbers must be 4–40 characters using letters, numbers, spaces, - / . +.";
    const k = row.code.replace(/\s+/g, "");
    if (seen.has(k)) return "Remove duplicate part numbers.";
    seen.add(k);
    if (row.quantity !== null && (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 999)) return "Quantity must be between 1 and 999.";
  }
  if (!p.name || p.name.length > 80) return "Enter your name (80 characters maximum).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) || p.email.length > 200) return "Enter a valid email address.";
  if (p.company.length > 120 || p.machine.length > 120 || p.phone.length > 50) return "One of your details is too long.";
  if (!URGENCIES.includes(p.urgency)) return "Select how urgently you need help.";
  if (!INTENTS.includes(p.intent)) return "Choose the help you need.";
  if (!p.processingConsent) return "Please confirm you want us to process this request.";
  return "";
}
function allowedOrigin(req) {
  const origin = String(req.headers?.origin ?? "");
  if (!origin) return true;
  let url; try { url = new URL(origin); } catch { return false; }
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").toLowerCase();
  if (url.protocol === "https:" && url.host.toLowerCase() === host) return true;
  if (["https://www.automation-outlet.co.uk", "https://automation-outlet.co.uk"].includes(origin)) return true;
  return process.env.VERCEL_ENV === "preview" && url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
}
// Pseudonymous daily rate limiting without another paid service.
// The raw IP is never saved; the daily identifier is keyed using AO_DEAL_DESK_KEY.
export function dayToken(req,day=new Date()){
  const ip=clean(req.headers?.["x-vercel-forwarded-for"]||req.headers?.["x-forwarded-for"]||req.headers?.["x-real-ip"],300).split(",")[0].trim();
  const secret=process.env.AO_DEAL_DESK_KEY;
  if(!ip||!secret)return ""; // local scripted tests; production calls normally provide a client IP.
  return createHmac("sha256",secret).update(day.toISOString().slice(0,10)+"|"+ip).digest("hex");
}
async function checkRateLimit(token) {
  if(!token)return;
  const base=process.env.AO_QUICK_CHECK_BASE_ID,table=process.env.AO_QUICK_CHECK_TABLE_ID,
    auth=process.env.AIRTABLE_ACCESS_TOKEN;
  if(!base||!table||!auth)throw Object.assign(new Error("Quick Check is not configured"),{status:503});
  const q=new URLSearchParams({pageSize:"6",filterByFormula:'{IP Day Token}="'+token+'"'});
  const res=await fetch("https://api.airtable.com/v0/"+encodeURIComponent(base)+"/"+encodeURIComponent(table)+"?"+q,{
    headers:{Authorization:"Bearer "+auth},signal:AbortSignal.timeout(6500)
  });
  if(!res.ok)throw Object.assign(new Error("Unable to check request limits"),{status:503});
  const data=await res.json();
  if((data.records||[]).length>=5)throw Object.assign(new Error("Daily limit reached. Please email AO for further checks."),{status:429});
}
async function notifyOwner(p,reference){
  // Operational notifications only; no customer or marketing email. Production opt-in gate.
  if(process.env.VERCEL_ENV!=="production"||process.env.AO_QC_OWNER_NOTIFY_ENABLED!=="true")return;
  const endpoint=process.env.FORMSPREE_QC_ENDPOINT||"https://formspree.io/f/xqevvvll";
  try{
    const res=await fetch(endpoint,{method:"POST",
      headers:{"Accept":"application/json","Content-Type":"application/json"},
      body:JSON.stringify({_subject:"AO Quick Check "+reference+" — "+p.urgency,
        name:p.name,company:p.company,email:p.email,phone:p.phone,
        request_reference:reference,parts:p.parts.map(x=>x.code+" / "+x.manufacturer).join("\n"),
        machine:p.machine,urgency:p.urgency,intent:p.intent,marketing_consent:p.marketingConsent?"yes":"no"}),
      signal:AbortSignal.timeout(6500)
    });
    if(!res.ok)console.warn("Quick Check owner notification failed:",res.status);
  }catch(e){console.warn("Quick Check owner notification failed:",e?.message||"unknown");}
}

async function persistLead(p,ipToken="") {
  const token=process.env.AIRTABLE_ACCESS_TOKEN;
  const base=process.env.AO_QUICK_CHECK_BASE_ID;
  const table=process.env.AO_QUICK_CHECK_TABLE_ID;
  if (!token || !base || !table) throw new Error("Quick Check Airtable is not configured");
  const reference="AQC-"+randomUUID().slice(0,8).toUpperCase();
  const fields = {
    "Request ID":reference, "Submitted At":new Date().toISOString(),
    "Name":p.name,"Company":p.company,"Email":p.email,"Phone":p.phone,
    "Machine / Site":p.machine,
    "Part Numbers":p.parts.map(x => [x.code,x.manufacturer,x.quantity === null ? "" : "Qty "+x.quantity].filter(Boolean).join(" | ")).join("\n"),
    "Urgency":p.urgency,"Help Needed":p.intent,
    "Marketing Consent":p.marketingConsent,"Processing Requested":true,
    "Status":"New","IP Day Token":ipToken,"Source Page":p.sourcePage || "/obsolescence-check.html","UTM Campaign":p.utmCampaign
  };
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetch("https://api.airtable.com/v0/"+encodeURIComponent(base)+"/"+encodeURIComponent(table),{
      method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({records:[{fields}],typecast:false}),signal:controller.signal
    });
    if (!response.ok) throw new Error("Airtable lead storage failed: "+response.status);
    return reference;
  } finally {clearTimeout(timer);}
}
export default async function handler(req,res) {
  res.setHeader("Allow","POST, OPTIONS");
  if (req.method==="OPTIONS") return res.status(204).end();
  if (req.method!=="POST") return json(res,405,{ok:false,error:"Method not allowed"});
  if (process.env.AO_QUICK_CHECK_ENABLED!=="true") return json(res,503,{ok:false,error:"This check is not accepting submissions yet. Please contact info@automation-outlet.co.uk."});
  if (!allowedOrigin(req)) return json(res,403,{ok:false,error:"Origin not allowed"});
  if (Number(req.headers?.["content-length"]||0)>12000) return json(res,413,{ok:false,error:"Request too large"});
  let data;
  try {data=typeof req.body==="string"?JSON.parse(req.body):req.body;} catch {return json(res,400,{ok:false,error:"Invalid request"});}
  if (!data || typeof data!=="object" || Array.isArray(data)) return json(res,400,{ok:false,error:"Invalid request"});
  const p=normaliseQuickCheck(data);
  // Silent honeypot: neither store nor send an email.
  if (p.website) return json(res,200,{ok:true,reference:"",test:false});
  const error=validateQuickCheck(p);
  if(error)return json(res,400,{ok:false,error});
  try {
    const token=dayToken(req);
    await checkRateLimit(token);
    const reference=await persistLead(p,token);
    await notifyOwner(p,reference);
    // Manual review only: NO automatic marketing, customer email or lifecycle results.
    return json(res,200,{ok:true,reference,count:p.parts.length});
  } catch(err) {
    console.error("Quick Check intake error:",err?.message||"unknown");
    const limited=err?.status===429;
    return json(res,limited?429:503,{ok:false,error:limited?"Daily request limit reached. Please email info@automation-outlet.co.uk for more checks.":"We could not save the request. Please email info@automation-outlet.co.uk."});
  }
}
