"use strict";

const state = {key:"",data:null,filtered:[],busy:false};
const byId = id => document.getElementById(id);

function message(id,text,isError=false) {
  const element=byId(id);
  element.textContent=text;
  element.classList.toggle("error",isError);
}
function number(value,fallback=null) {
  if (value===null || value===undefined || String(value).trim()==="") return fallback;
  const n=Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function pounds(n) {return new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:2}).format(n);}
function money(n,currency) {
  if (!Number.isFinite(n) || !currency) return "Request quote";
  try {return new Intl.NumberFormat("en-GB",{style:"currency",currency,maximumFractionDigits:2}).format(n);}
  catch {return currency+" "+n.toFixed(2);}
}
function dateStamp(d) {
  if (!d || Number.isNaN(Date.parse(d))) return "Date unconfirmed";
  return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(d));
}
function rate(currency) {
  if (currency==="GBP") return 1;
  if (currency==="EUR") {const n=number(byId("rateEur").value);return n>0?n:null;}
  if (currency==="USD") {const n=number(byId("rateUsd").value);return n>0?n:null;}
  return null;
}
function gbpCost(item) {
  const r=rate(item.currency);
  return item.unitPrice!==null && Number.isFinite(item.unitPrice) && r!==null ? item.unitPrice*r : null;
}
function profit(item) {
  const resale=number(byId("resaleGbp").value);
  if (resale===null || resale<=0) return null;
  const purchase=gbpCost(item);
  if(purchase===null) return null;
  const extras=Math.max(0,number(byId("additionalGbp").value,0));
  const fee=Math.max(0,Math.min(100,number(byId("feesPct").value,0)));
  const gross=resale-purchase-extras-resale*(fee/100);
  return {gross,margin:gross/resale*100,purchase};
}
const EU = new Set(["AT","AUSTRIA","BE","BELGIUM","BG","BULGARIA","HR","CROATIA","CY","CYPRUS","CZ","CZECHIA","CZECH REPUBLIC","DK","DENMARK","EE","ESTONIA","FI","FINLAND","FR","FRANCE","DE","GERMANY","GR","GREECE","HU","HUNGARY","IE","IRELAND","IT","ITALY","LV","LATVIA","LT","LITHUANIA","LU","LUXEMBOURG","MT","MALTA","NL","NETHERLANDS","PL","POLAND","PT","PORTUGAL","RO","ROMANIA","SK","SLOVAKIA","SI","SLOVENIA","ES","SPAIN","SE","SWEDEN"]);
function region(country) {
  const c=String(country||"").trim().toUpperCase();
  if (["GB","UK","UNITED KINGDOM","GREAT BRITAIN","ENGLAND","SCOTLAND","WALES","NORTHERN IRELAND"].includes(c)) return "uk";
  if(EU.has(c)) return "eu";
  return "other";
}
function domCell(row,text,cls,sub) {
  const td=document.createElement("td");
  if(cls)td.className=cls;
  const title=document.createElement("strong");
  title.textContent=text===null || text===undefined ? "—" : String(text);
  td.appendChild(title);
  if(sub) {const small=document.createElement("small");small.textContent=String(sub);td.appendChild(small);}
  row.appendChild(td);
  return td;
}
function resetView() {
  state.data=null;state.filtered=[];
  for(const key of ["mExact","mAvailable","mSuppliers","mPriced"])byId(key).textContent="—";
  byId("resultsBody").replaceChildren();
  byId("empty").hidden=false;
  byId("resultSubtitle").textContent="Search a part number to see available suppliers.";
  byId("resultStatus").textContent="";
  byId("copyButton").disabled=true;
}
function applyFilters(){
  if(!state.data){return resetView();}
  let rows=[...(state.data.offers||[])];
  const condition=byId("conditionFilter").value;
  const location=byId("locationFilter").value;
  if(condition!=="all") rows=rows.filter(x=>x.conditionGroup===condition);
  if(location!=="all") rows=rows.filter(x=>region(x.supplierCountry)===location);
  if(byId("pricedOnly").checked) rows=rows.filter(x=>x.unitPrice!==null && x.currency);
  switch(byId("sortFilter").value) {
    case "price": rows.sort((a,b)=>(gbpCost(a)??Infinity)-(gbpCost(b)??Infinity) || b.quantity-a.quantity);break;
    case "updated": rows.sort((a,b)=>Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0));break;
    case "supplier": rows.sort((a,b)=>a.supplier.localeCompare(b.supplier));break;
    default: rows.sort((a,b)=>b.quantity-a.quantity);
  }
  state.filtered=rows;
  byId("mExact").textContent=state.data.summary.exactOffers.toLocaleString("en-GB");
  byId("mAvailable").textContent=state.data.summary.availableOffers.toLocaleString("en-GB");
  byId("mSuppliers").textContent=state.data.summary.suppliers.toLocaleString("en-GB");
  byId("mPriced").textContent=state.data.summary.offersWithPrice.toLocaleString("en-GB");
  byId("resultSubtitle").textContent=rows.length+" shown · "+state.data.summary.returned+" total search entries · exact part number only";
  byId("resultStatus").textContent="Checked "+new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit"}).format(new Date(state.data.summary.updatedAt));
  byId("copyButton").disabled=rows.length===0;
  const frag=document.createDocumentFragment();
  for(const item of rows){
    const tr=document.createElement("tr");
    domCell(tr,item.supplier,"",item.supplierCountry);
    domCell(tr,item.brand||"Unknown manufacturer","",item.mpn);
    const cond=domCell(tr,item.condition,"",item.delivery+" · "+dateStamp(item.updatedAt));
    const pill=document.createElement("span");
    pill.className="pill "+item.conditionGroup;
    pill.textContent=item.conditionGroup;
    cond.appendChild(document.createTextNode(" "));
    cond.appendChild(pill);
    domCell(tr,item.quantity.toLocaleString("en-GB"));
    const cost=gbpCost(item);
    domCell(tr,money(item.unitPrice,item.currency),"mono",cost!==null && item.currency!=="GBP"?"≈ "+pounds(cost)+" at entered FX":item.status);
    const p=profit(item);
    if(p) {
      const cell=domCell(tr,pounds(p.gross),p.gross>=0?"gain":"loss",p.margin.toFixed(1)+"% indicative margin");
      cell.title="Estimated gross profit per unit before VAT treatment and unentered costs.";
    } else {
      const reason=item.unitPrice===null?"Price not supplied":item.currency!=="GBP" && rate(item.currency)===null?"Enter conversion rate":"Enter target sale price";
      domCell(tr,"—","",reason);
    }
    frag.appendChild(tr);
  }
  byId("resultsBody").replaceChildren(frag);
  byId("empty").hidden=rows.length>0;
  if(rows.length===0) {
    const text=byId("empty");
    text.replaceChildren();
    const h=document.createElement("strong");
    h.textContent="No matching offers";
    const p=document.createElement("p");
    p.textContent=state.data.summary.exactOffers===0?"Automa.Net returned no exact part-number matches.":"Try clearing the filters or check availability later.";
    text.append(h,p);
  }
}
async function callApi(query,key){
  const params=new URLSearchParams({supplierSearch:"1",...(query?{q:query}:{check:"1"})});
  const response=await fetch("/api/catalogue?"+params,{
    method:"GET",cache:"no-store",credentials:"same-origin",
    headers:{"Accept":"application/json","X-Deal-Desk-Key":key},
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) {const error=new Error(data.error||"Request failed ("+response.status+")");error.status=response.status;throw error;}
  return data;
}
async function unlock(key,silent=false){
  if(!key) return;
  byId("loginButton").disabled=true;
  if(!silent) message("loginMessage","Checking access…");
  try {
    await callApi(null,key);
    state.key=key;
    sessionStorage.setItem("aoSupplierDeskKey",key);
    byId("gate").hidden=true;
    byId("workspace").hidden=false;
    byId("lock").hidden=false;
    byId("adminKey").value="";
    message("loginMessage","");
    byId("partNumber").focus();
  } catch(e) {
    sessionStorage.removeItem("aoSupplierDeskKey");
    if(!silent) message("loginMessage",e.message,true);
  } finally {byId("loginButton").disabled=false;}
}
async function search(part){
  if(state.busy) return;
  const query=String(part||"").trim();
  if(query.length<3 || query.length>64) {message("searchMessage","Please enter a manufacturer part number between 3 and 64 characters.",true);return;}
  state.busy=true;
  byId("searchButton").disabled=true;
  byId("searchButton").textContent="Searching…";
  message("searchMessage","Searching supplier listings for "+query+"…");
  try {
    const response=await callApi(query,state.key);
    state.data=response;
    applyFilters();
    message("searchMessage","Search complete. Confirm supplier prices and available quantities before quoting.");
  }catch(e){
    message("searchMessage",e.message,true);
    if(e.status===401){state.key="";sessionStorage.removeItem("aoSupplierDeskKey");byId("gate").hidden=false;byId("workspace").hidden=true;byId("lock").hidden=true;message("loginMessage","Session expired. Please unlock again.",true);}
  }finally{state.busy=false;byId("searchButton").disabled=false;byId("searchButton").textContent="Search suppliers →";}
}
async function copyShortlist(){
  if(!state.data || state.filtered.length===0) return;
  const parts=["AO Supplier Search · "+state.data.query,
    "Supplier-reported inventory — verify all offers before quoting.",
    "Supplier | Country | Part | Condition | Qty | Unit price | Est gross profit"];
  for(const x of state.filtered.slice(0,40)){
    const p=profit(x);
    parts.push([x.supplier,x.supplierCountry,x.mpn,x.condition,x.quantity,money(x.unitPrice,x.currency),p?pounds(p.gross):"—"].join(" | "));
  }
  try{
    await navigator.clipboard.writeText(parts.join("\n"));
    byId("copyButton").textContent="Copied!";
    window.setTimeout(()=>{byId("copyButton").textContent="Copy shortlist";},1800);
  }catch{message("searchMessage","Clipboard unavailable. Please copy from the table.",true);}
}
byId("loginForm").addEventListener("submit",e=>{e.preventDefault();unlock(byId("adminKey").value);});
byId("lock").addEventListener("click",()=>{
  sessionStorage.removeItem("aoSupplierDeskKey");
  state.key="";
  resetView();
  byId("workspace").hidden=true;
  byId("gate").hidden=false;
  byId("lock").hidden=true;
  message("loginMessage","Dashboard locked.");
});
byId("searchForm").addEventListener("submit",e=>{e.preventDefault();search(byId("partNumber").value);});
document.querySelectorAll("[data-part]").forEach(button=>button.addEventListener("click",()=>{
  byId("partNumber").value=button.dataset.part;
  search(button.dataset.part);
}));
for(const id of ["conditionFilter","locationFilter","sortFilter","pricedOnly","resaleGbp","additionalGbp","feesPct","rateEur","rateUsd"]){
  byId(id).addEventListener("input",()=>{if(state.data)applyFilters();});
}
byId("copyButton").addEventListener("click",copyShortlist);
resetView();
const saved=sessionStorage.getItem("aoSupplierDeskKey")||sessionStorage.getItem("aoDealDeskKey");
if(saved) unlock(saved,true);
