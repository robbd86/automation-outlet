// Public, same-origin intake for the AO Private Factory Spares Network.
// Lead is accepted only after Airtable or Formspree confirms receipt.
const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_FORMSPREE_ENDPOINT = "https://formspree.io/f/xqevvvll";
const ALLOWED_ROLES = new Set(["Maintenance manager / engineer","Engineering manager","Factory / operations manager","Stores / purchasing","Controls engineer","Business owner","Other"]);
const ALLOWED_INTERESTS = new Set(["Find spares","Offer surplus","Both"]);

function clean(value, max=200) {
  return String(value ?? "").replace(/\0/g,"").trim().slice(0,max);
}
function json(res,status,payload){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  return res.status(status).json(payload);
}
function validEmail(value){return value.length<=200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
function parseBody(body){if(body&&typeof body==="object")return body;if(typeof body==="string")return JSON.parse(body);return {};}
function allowedOrigin(req){
  const origin=clean(req.headers?.origin,500);
  if(!origin)return true; // non-browser POST callers have no Origin header.
  let url;try{url=new URL(origin)}catch{return false;}
  const hosts=[req.headers?.host,req.headers?.["x-forwarded-host"]].filter(Boolean).map(h=>clean(h,255).toLowerCase());
  if(url.protocol==="https:" && hosts.includes(url.host.toLowerCase()))return true;
  const allow=["https://automation-outlet.co.uk","https://www.automation-outlet.co.uk"];
  if(process.env.VERCEL_ENV==="preview"&&url.protocol==="https:"&&url.hostname.endsWith(".vercel.app"))return true;
  return allow.includes(origin);
}
export function normaliseRegistration(body){
  return {
    name:clean(body.name,120),
    company:clean(body.company,160),
    email:clean(body.email,200).toLowerCase(),
    phone:clean(body.phone,50),
    jobRole:clean(body.job_role,100),
    siteLocation:clean(body.site_location,160),
    interest:clean(body.interest,40),
    equipment:clean(body.equipment,2000),
    consent:body.consent===true || clean(body.consent,10).toLowerCase()==="yes",
    website:clean(body.website,200),
    utmSource:clean(body.utm_source,80),
    utmCampaign:clean(body.utm_campaign,80),
    sourcePage:"factory-spares-network",
  };
}
export function validateRegistration(p){
  if(!p.name||!p.company||!p.siteLocation)return "Name, company and site location are required";
  if(!validEmail(p.email))return "A valid work email is required";
  if(!ALLOWED_ROLES.has(p.jobRole))return "Please select a valid job role";
  if(!ALLOWED_INTERESTS.has(p.interest))return "Please select a valid interest";
  if(!p.consent)return "Consent is required";
  return "";
}
function leadFields(p){
  return {
    Name:p.name,Company:p.company,Email:p.email,Phone:p.phone,
    "Job Role":p.jobRole,"Site Location":p.siteLocation,Interest:p.interest,
    "Equipment / Challenges":p.equipment,Consent:true,Status:"New",
    "Lead Source":p.utmSource ? "Website Pilot — "+p.utmSource : "Website Pilot",
    Campaign:p.utmCampaign, "Signup Date":new Date().toISOString()
  };
}
async function saveAirtable(p){
  const token=process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId=process.env.AIRTABLE_PILOT_BASE_ID;
  const tableId=process.env.AIRTABLE_PILOT_TABLE_ID;
  if(!token||!baseId||!tableId)throw new Error("Pilot Airtable is not configured");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7000);
  try{
    const response=await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`,{
      method:"POST",
      headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({records:[{fields:leadFields(p)}],typecast:false}),
      signal:controller.signal
    });
    if(!response.ok)throw new Error("Airtable returned status "+response.status);
    return true;
  }finally{clearTimeout(timer);}
}
async function saveFormspree(p){
  const endpoint=process.env.FORMSPREE_PILOT_ENDPOINT || process.env.FORMSPREE_NETWORK_ENDPOINT || DEFAULT_FORMSPREE_ENDPOINT;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7000);
  try{
    const response=await fetch(endpoint,{
      method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},
      body:JSON.stringify({
        _subject:"New AO Factory Spares Pilot Registration",
        signup_type:"factory-spares-pilot",
        name:p.name,company:p.company,email:p.email,phone:p.phone,
        job_role:p.jobRole,site_location:p.siteLocation,interest:p.interest,
        equipment:p.equipment,consent:"yes",
        lead_source:p.utmSource||"Website Pilot",utm_campaign:p.utmCampaign
      }),signal:controller.signal
    });
    if(!response.ok)throw new Error("Formspree returned status "+response.status);
    return true;
  }finally{clearTimeout(timer);}
}
export default async function handler(req,res){
  res.setHeader("Allow","POST, OPTIONS");
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST")return json(res,405,{ok:false,error:"Method not allowed"});
  if(!allowedOrigin(req))return json(res,403,{ok:false,error:"Origin not allowed"});
  if(Number(req.headers?.["content-length"]||0)>12000)return json(res,413,{ok:false,error:"Request too large"});
  let raw;
  try{raw=parseBody(req.body);}catch{return json(res,400,{ok:false,error:"Malformed request"});}
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return json(res,400,{ok:false,error:"Malformed request"});
  const p=normaliseRegistration(raw);
  // Quietly discard automated honeypot posts without writing any contact details.
  if(p.website)return json(res,200,{ok:true,message:"Registration received"});
  const problem=validateRegistration(p);
  if(problem)return json(res,400,{ok:false,error:problem});
  const result=await Promise.allSettled([saveAirtable(p),saveFormspree(p)]);
  const persisted=result.some(item=>item.status==="fulfilled"&&item.value===true);
  for(let i=0;i<result.length;i++){
    if(result[i].status==="rejected")console.error("Pilot lead "+(i===0?"Airtable":"Formspree")+" failed:",result[i].reason?.message||"Unknown error");
  }
  if(!persisted)return json(res,503,{ok:false,error:"Could not record your registration. Please email AO."});
  return json(res,200,{ok:true,message:"Registration received"});
}
