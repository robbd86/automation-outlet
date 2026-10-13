import {unsubLink} from "./quick-check-unsubscribe.mjs";
// Server-side admin/research workflow for AO Quick Checks.
// Never exposes the Airtable token, admin password, or private lead list publicly.
const ALLOWED_STATUS=new Set(["New","Researching","Summary ready","Summary sent","Quote requested","Quoted","Order won","Closed"]);
const LIFECYCLE=new Set(["Active","Mature","Phase-out","Discontinued","Unknown — check"]);
const SUPPLY=new Set(["Listed","Sourcing possible","Not currently","Not checked"]);
const MAKES=new Set(["Siemens","Allen-Bradley","Omron","Mitsubishi","Other","Not sure"]);
const DOMAINS={
  Siemens:["siemens.com"],
  "Allen-Bradley":["rockwellautomation.com"],
  Omron:["omron.com","omron.eu","omron.co.jp","omron.co.uk"],
  Mitsubishi:["mitsubishielectric.com","mitsubishielectric.co.jp"],
};
const clean=(v,n=300)=>String(v??"").replace(/\0/g,"").trim().slice(0,n);
const canonical=(v)=>clean(v,80).toUpperCase().replace(/\s+/g,"");
const settings=()=>({
 token:process.env.AIRTABLE_ACCESS_TOKEN,base:process.env.AO_QUICK_CHECK_BASE_ID,
 leads:process.env.AO_QUICK_CHECK_TABLE_ID,cache:process.env.AO_QUICK_CHECK_CACHE_TABLE_ID,
});
const BASE="https://api.airtable.com/v0";
function assertSettings(cache=false){
 const s=settings();
 if(!s.token||!s.base||!s.leads||(cache&&!s.cache))throw Object.assign(new Error("Quick Check Airtable settings missing"),{status:503});
 return s;
}
async function request(table,method="GET",suffix="",body){
 const s=assertSettings(true);
 const response=await fetch(BASE+"/"+encodeURIComponent(s.base)+"/"+encodeURIComponent(table)+suffix,{
   method,headers:{Authorization:"Bearer "+s.token,"Content-Type":"application/json"},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8500),
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error("Airtable error ("+response.status+")"),{status:502});
 return data;
}
async function list(table,max=200,sortBy){
 let results=[],offset="";
 do{
   const q=new URLSearchParams({pageSize:"100"});
   if(offset)q.set("offset",offset);
   if(sortBy){q.set("sort[0][field]",sortBy);q.set("sort[0][direction]","desc");}
   const data=await request(table,"GET","?"+q);
   results.push(...(data.records||[]));offset=data.offset||"";
 }while(offset&&results.length<max);
 return results.slice(0,max);
}
export function partRows(value){
 return clean(value,2000).split(/\r?\n/).filter(Boolean).slice(0,5).map(line=>{
  const bits=line.split(" | ").map(x=>clean(x,120));
  const match=(bits[2]||"").match(/^Qty (\d+)$/);
  return {code:bits[0]||"",manufacturer:MAKES.has(bits[1])?bits[1]:"Not sure",quantity:match?Number(match[1]):null};
 }).filter(x=>x.code);
}
export function sourceAllowed(manufacturer,value){
 let url;try{url=new URL(value);}catch{return false;}
 if(url.protocol!=="https:"||url.username||url.password)return false;
 const domains=DOMAINS[manufacturer]||[];
 return domains.some(d=>url.hostname.toLowerCase()===d||url.hostname.toLowerCase().endsWith("."+d));
}
export function cacheMatch(row,records,now=new Date()){
 const code=canonical(row.code);
 const record=records.find(rec=>{
  const f=rec.fields||rec;
  return canonical(f["Part Number"])===code&&
   (row.manufacturer==="Not sure"||row.manufacturer==="Other"||f.Manufacturer===row.manufacturer);
 });
 if(!record)return null;
 const f=record.fields||record;
 const lifecycle=clean(f.Lifecycle,50);
 const age=Date.parse(f["Last Verified"]);
 const recent=Number.isFinite(age)&&now.getTime()>=age&&now.getTime()-age<=90*86400000;
 const source=clean(f["Manufacturer Source"],600);
 if(!recent||!LIFECYCLE.has(lifecycle)||lifecycle==="Unknown — check"||
   !sourceAllowed(f.Manufacturer,source))return null;
 const supplyAge=now.getTime()-age;
 const available=clean(f.Availability,50);
 const availability=supplyAge<=7*86400000&&available!=="Listed"&&SUPPLY.has(available)?available:"Not checked";
 return {
  lifecycle,manufacturer:f.Manufacturer,source,lastVerified:f["Last Verified"],
  successor:clean(f.Successor,120)||"Not published/confirmed",
  availability,notes:clean(f.Notes,700)
 };
}
export function riskHint(lifecycle,availability,urgency){
 if(!lifecycle||lifecycle==="Unknown — check")return "Unknown";
 if(lifecycle==="Discontinued"&&(availability==="Not currently"||urgency==="Machine is down now"))return "High";
 if(["Discontinued","Phase-out"].includes(lifecycle))return "Medium";
 if(["Active","Mature"].includes(lifecycle))return "Low (lifecycle only)";
 return "Unknown";
}
export function reportForLead(lead,cacheRecords,now=new Date()){
 const p=lead.fields||lead;
 const parts=partRows(p["Part Numbers"]);
 const lines=parts.map(part=>{
  const found=cacheMatch(part,cacheRecords,now);
  return {code:part.code,manufacturer:found?.manufacturer||part.manufacturer,qty:part.quantity,
   lifecycle:found?.lifecycle||"Unknown — check",successor:found?.successor||"Not verified",
   availability:found?.availability||"Not checked",source:found?.source||"",
   verified:found?.lastVerified||"",risk:riskHint(found?.lifecycle,found?.availability,p.Urgency),
   notes:found?.notes||""};
 });
 const ready=lines.length>0&&lines.every(x=>x.source&&x.verified&&x.lifecycle!=="Unknown — check");
 const reference=clean(p["Request ID"],50),firstname=clean(p.Name,100).split(" ")[0]||"there";
 const body=[
  "Hi "+firstname+",",
  "",
  "Thanks for sending your automation part numbers. I've completed a preliminary desktop lifecycle and sourcing review.",
  "",
  ...lines.flatMap(x=>[
   x.code+" ("+x.manufacturer+")"+(x.qty?" — "+x.qty+" installed":""),
   "Manufacturer lifecycle: "+x.lifecycle,
   "Successor: "+x.successor,
   "Supply route: "+x.availability,
   "Preliminary supply risk: "+x.risk,
   "Official source: "+(x.source||"Not verified — manual check needed"),
   "Source checked: "+(x.verified?x.verified.slice(0,10):"Pending"),
   ...(x.notes?["Engineering note: "+x.notes]:[]),
   ""
  ]),
  "These are preliminary supply-risk indicators, not an assessment of your machine's actual production criticality.",
  "Any replacement requires a separate check of revisions, firmware, compatibility and condition. Availability and price are confirmed before a quotation.",
  "",
  "If you need a spare now, reply with the exact part, required quantity, acceptable condition and delivery deadline.",
  "For a complete line review, our fixed-price Essential Obsolescence Audit starts at £195 for up to 20 components.",
  "",
  "Desktop assessment based on supplied information and published manufacturer details. Not an on-site inspection, safety/compatibility certification or a guarantee of future parts availability.",
  "",
  "Rob",
  "Automation Outlet",
  "info@automation-outlet.co.uk"
 ].join("\n");
 return {reference,email:clean(p.Email,200),name:clean(p.Name,120),
  subject:"Your AO obsolescence check — "+reference,body,lines,ready,
  verifiedCount:lines.filter(x=>x.source).length,pendingCount:lines.filter(x=>!x.source).length};
}
export function acknowledgement(lead){
 const f=lead.fields||lead;
 const first=clean(f.Name,80).split(" ")[0]||"there";
 const id=clean(f["Request ID"],45);
 const n=partRows(f["Part Numbers"]).length;
 return {email:clean(f.Email,200),subject:"AO received your part numbers — "+id,
  body:"Hi "+first+",\n\nThanks for sending "+n+" automation part number(s). Your reference is "+id+".\n\nI'll review published manufacturer lifecycle information and potential spare sourcing routes, aiming to reply within two working days.\n\nIf the machine is down, WhatsApp 07849 506371 so I can see your requirement sooner.\n\nRob\nAutomation Outlet\ninfo@automation-outlet.co.uk"};
}
function visibleLead(record){
 const f=record.fields||{};
 return {id:record.id,reference:f["Request ID"],submitted:f["Submitted At"]||record.createdTime,
  name:f.Name,company:f.Company,email:f.Email,phone:f.Phone,machine:f["Machine / Site"],
  urgency:f.Urgency,intent:f["Help Needed"],partNumbers:f["Part Numbers"],status:f.Status,
  marketingConsent:f["Marketing Consent"]===true,notes:f["Review Notes"]||"",
  draft:f["Report Draft"]||"",unsubscribeUrl:f["Marketing Consent"]===true?unsubLink(record.id):"",quoteValue:f["Quote Value"]||0,
  orderGrossProfit:f["Order Gross Profit"]||0,reviewedAt:f["Reviewed At"]||"",
  sentAt:f["Summary Sent At"]||""};
}
export async function fetchDesk(){
 const s=assertSettings(true);
 const [raw,cache]=await Promise.all([list(s.leads,200,"Submitted At"),list(s.cache,500,"Last Verified")]);
 const requests=raw.map(x=>({ ...visibleLead(x),report:reportForLead(x,cache),acknowledgement:acknowledgement(x)}));
 const metrics={
  enquiries:requests.length,
  active:requests.filter(x=>["New","Researching","Summary ready","Quote requested"].includes(x.status)).length,
  quotes:requests.filter(x=>["Quoted","Order won"].includes(x.status)).length,
  orders:requests.filter(x=>x.status==="Order won").length,
  quotedValue:requests.reduce((a,x)=>a+(Number(x.quoteValue)||0),0),
  grossProfit:requests.reduce((a,x)=>a+(Number(x.orderGrossProfit)||0),0),
  partsSubmitted:requests.reduce((a,x)=>a+partRows(x.partNumbers).length,0),
 };
 return {requests,metrics,cacheRecords:cache.length};
}
export async function verifyPart(data){
 const s=assertSettings(true);
 const part=canonical(data.code),manufacturer=clean(data.manufacturer,80),
   lifecycle=clean(data.lifecycle,60),availability=clean(data.availability,60),
   source=clean(data.source,600),successor=clean(data.successor,120),notes=clean(data.notes,500);
 if(!/^[A-Z0-9.+/-]{4,40}$/.test(part)||!MAKES.has(manufacturer)||manufacturer==="Not sure")throw Object.assign(new Error("Valid code and manufacturer required"),{status:400});
 if(!LIFECYCLE.has(lifecycle)||!SUPPLY.has(availability))throw Object.assign(new Error("Invalid lifecycle/availability"),{status:400});
 if(lifecycle!=="Unknown — check"&&!sourceAllowed(manufacturer,source))throw Object.assign(new Error("A valid official manufacturer HTTPS URL is required to verify lifecycle"),{status:400});
 const fields={"Part Number":part,"Manufacturer":manufacturer,"Lifecycle":lifecycle,
  "Successor":successor,"Manufacturer Source":source||null,
  "Last Verified":new Date().toISOString(),"Availability":availability,"Notes":notes};
 const lookup=await list(s.cache,500);
 const existing=lookup.find(x=>canonical(x.fields?.["Part Number"])===part&&x.fields?.Manufacturer===manufacturer);
 if(existing){
  await request(s.cache,"PATCH","",{records:[{id:existing.id,fields}],typecast:false});
 }else{await request(s.cache,"POST","",{records:[{fields}],typecast:false});}
 return {ok:true,part,lifecycle};
}
export async function updateLead(data){
 const s=assertSettings(true);
 const id=clean(data.id,50);
 if(!/^rec[A-Za-z0-9]{14}$/.test(id))throw Object.assign(new Error("Invalid lead ID"),{status:400});
 const rows=await list(s.leads,200,"Submitted At");
 const lead=rows.find(x=>x.id===id);
 if(!lead)throw Object.assign(new Error("Request not found"),{status:404});
 const status=clean(data.status,50);
 if(!ALLOWED_STATUS.has(status))throw Object.assign(new Error("Invalid request status"),{status:400});
 const notes=clean(data.notes,2000);
 const fields={"Status":status,"Review Notes":notes};
 if(data.quoteValue!==undefined&&data.quoteValue!==""){
  const v=Number(data.quoteValue);if(!Number.isFinite(v)||v<0||v>10000000)throw Object.assign(new Error("Invalid quote value"),{status:400});
  fields["Quote Value"]=v;
 }
 if(data.orderGrossProfit!==undefined&&data.orderGrossProfit!==""){
  const v=Number(data.orderGrossProfit);if(!Number.isFinite(v)||v<0||v>10000000)throw Object.assign(new Error("Invalid gross profit"),{status:400});
  fields["Order Gross Profit"]=v;
 }
 if(status==="Summary ready"){
  const cache=await list(s.cache,500);
  const report=reportForLead(lead,cache);
  if(!report.ready&&!(data.acceptUnknown===true&&notes.length>=40))throw Object.assign(new Error("Some parts remain Unknown — check. Add at least 40 characters of research notes and explicitly accept unresolved results before approving."),{status:409});
  fields["Report Draft"]=clean(data.reportDraft||report.body,15000);
  fields["Reviewed At"]=new Date().toISOString();
 }
 if(status==="Summary sent"){
  if(lead.fields.Status!=="Summary ready"&&lead.fields.Status!=="Summary sent")throw Object.assign(new Error("Approve the reviewed draft before recording it sent"),{status:409});
  fields["Summary Sent At"]=new Date().toISOString();
 }
 await request(s.leads,"PATCH","",{records:[{id,fields}],typecast:false});
 return {ok:true,id,status};
}
