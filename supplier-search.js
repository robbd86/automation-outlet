"use strict";

const state = {key:"",data:null,filtered:[],busy:false,mobileVisible:20};
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
  const n=number(state.data?.fx?.rates?.[String(currency||"").toUpperCase()]);
  return n!==null && n>0 ? n : null;
}
function gbpCost(item) {
  const r=rate(item.currency);
  return item.unitPrice!==null && Number.isFinite(item.unitPrice) && r!==null ? item.unitPrice*r : null;
}
function shippingFor(item) {
  const id=region(item.supplierCountry)==="uk"?"shipUk":region(item.supplierCountry)==="eu"?"shipEu":"shipOther";
  return Math.max(0,number(byId(id).value,0));
}
function landedDetails(item) {
  const purchase=gbpCost(item);
  if (purchase===null) return null;
  const shipping=shippingFor(item);
  const taxRate=region(item.supplierCountry)==="uk"?0:Math.max(0,Math.min(100,number(byId("importAllowancePct").value,0)));
  const tax=(purchase+shipping)*taxRate/100;
  const extra=Math.max(0,number(byId("additionalGbp").value,0));
  return {purchase,shipping,tax,extra,total:purchase+shipping+tax+extra};
}
function profit(item) {
  const resale=number(byId("resaleGbp").value);
  if (resale===null || resale<=0) return null;
  const landed=landedDetails(item);
  if(!landed) return null;
  const fee=Math.max(0,Math.min(100,number(byId("feesPct").value,0)));
  const gross=resale-landed.total-resale*fee/100;
  return {gross,margin:gross/resale*100,purchase:landed.purchase,landed:landed.total};
}
function opportunityScore(item, cheapest) {
  const landed=landedDetails(item);
  if(!landed) return null;
  const cost=Math.max(0,Math.min(45,45*cheapest/Math.max(landed.total,0.01)));
  const quality={New:20,Refurbished:13,Used:8,Other:3}[item.conditionGroup] ?? 0;
  const qty=item.quantity>=10?10:item.quantity>=5?7:item.quantity>=2?5:3;
  const stamp=Date.parse(item.updatedAt||"");
  const age=Number.isFinite(stamp) ? Math.max(0,(Date.now()-stamp)/86400000):Infinity;
  const freshness=age<=2?10:age<=7?7:age<=30?4:0;
  const area=region(item.supplierCountry);
  const location=area==="uk"?10:area==="eu"?6:1;
  const status=/in.stock|available/i.test(item.status)?5:0;
  return Math.round(cost+quality+qty+freshness+location+status);
}
function rankedOffers(rows) {
  const candidates=rows.filter(x=>landedDetails(x)!==null);
  const cheapest=Math.min(...candidates.map(x=>landedDetails(x).total));
  const scored=candidates.map(item=>({...item,score:opportunityScore(item,cheapest)}));
  // A known negative margin should not outrank a positive-margin opportunity.
  scored.sort((a,b)=>{
    const pa=profit(a),pb=profit(b);
    const aPositive=pa ? pa.gross>0 : true;
    const bPositive=pb ? pb.gross>0 : true;
    if(aPositive!==bPositive) return aPositive?-1:1;
    return b.score-a.score || landedDetails(a).total-landedDetails(b).total;
  });
  return scored;
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

function updateFxWarning(){
  const fx=state.data?.fx;
  const valid=fx?.status==="available";
  byId("fxWarning").classList.toggle("visible",Boolean(state.data)&&!valid);
  if(!state.data) {
    byId("fxStatus").textContent="Rates are checked automatically when you search.";
    return;
  }
  if(!valid){
    byId("fxStatus").textContent="Rates unavailable. GBP prices remain usable; foreign-currency landed costs cannot be ranked.";
    return;
  }
  const eur=rate("EUR"),usd=rate("USD");
  const line="Reference rates "+(fx.date||"date unavailable")+". "+
    (eur!==null?"€1 ≈ "+pounds(eur)+"; ":"")+
    (usd!==null?"$1 ≈ "+pounds(usd)+". ":"")+
    "Bank / card FX charges may differ.";
  byId("fxStatus").textContent=line;
}
function renderOpportunities(rows) {
  const available=rankedOffers(rows).filter(item=>{
    const p=profit(item);
    return p===null || p.gross>0;
  });
  const section=byId("opportunities");
  section.hidden=available.length===0;
  const root=byId("topOpportunities");
  const frag=document.createDocumentFragment();
  for(const [i,item] of available.slice(0,3).entries()){
    const card=document.createElement("article");card.className="opportunity";
    const heading=document.createElement("div");heading.className="opportunity-rank";
    const rank=document.createElement("span");rank.textContent="#"+(i+1)+" ranked estimate";
    const score=document.createElement("span");score.textContent=item.score+"/100";
    heading.append(rank,score);
    const supplier=document.createElement("div");supplier.className="opportunity-name";
    supplier.textContent=item.supplier;
    const meta=document.createElement("div");meta.className="opportunity-meta";
    meta.textContent=item.condition+" · "+item.quantity+" listed · "+item.supplierCountry;
    const landed=landedDetails(item);
    const total=document.createElement("div");total.className="opportunity-cost";
    total.textContent=pounds(landed.total);
    const detail=document.createElement("div");detail.className="opportunity-sub";
    detail.textContent="Estimated landed / unit · "+money(item.unitPrice,item.currency)+" supplier";
    const p=profit(item);
    const profitLabel=document.createElement("div");profitLabel.className="opportunity-sub";
    profitLabel.textContent=p?"Est. profit "+pounds(p.gross)+" ("+p.margin.toFixed(1)+"%)":"Enter target resale price to calculate profit";
    card.append(heading,supplier,meta,total,detail,profitLabel);
    frag.appendChild(card);
  }
  root.replaceChildren(frag);
}
function infoBlock(label,value,subtitle="",valueClass=""){
  const box=document.createElement("div");
  const labelNode=document.createElement("div");
  labelNode.className="offer-card-label";
  labelNode.textContent=label;
  const valueNode=document.createElement("div");
  valueNode.className="offer-card-value "+valueClass;
  valueNode.textContent=String(value??"—");
  box.append(labelNode,valueNode);
  if(subtitle){
    const note=document.createElement("div");
    note.className="offer-card-note";
    note.textContent=subtitle;
    box.appendChild(note);
  }
  return box;
}
function renderMobileCards(rows){
  const container=byId("offerCards");
  const frag=document.createDocumentFragment();
  for(const item of rows.slice(0,state.mobileVisible)){
    const card=document.createElement("article");
    card.className="offer-card";
    const header=document.createElement("div");
    header.className="offer-card-header";
    const supplier=document.createElement("div");
    const name=document.createElement("div");
    name.className="offer-card-name";
    name.textContent=item.supplier;
    const country=document.createElement("div");
    country.className="offer-card-location";
    country.textContent=item.supplierCountry;
    supplier.append(name,country);
    const pill=document.createElement("span");
    pill.className="pill "+item.conditionGroup;
    pill.textContent=item.conditionGroup;
    header.append(supplier,pill);
    const part=document.createElement("div");
    part.className="offer-card-mpn";
    part.textContent=(item.brand||"Manufacturer not specified")+" · "+item.mpn;
    const grid=document.createElement("div");
    grid.className="offer-card-details";
    const purchase=gbpCost(item);
    const equivalent = purchase!==null && item.currency!=="GBP" ?
      "≈ "+pounds(purchase)+" at entered FX" :
      item.unitPrice!==null && item.currency!=="GBP" ? "Enter FX for GBP comparison" : "";
    const landed=landedDetails(item);
    grid.append(
      infoBlock("Supplier price",money(item.unitPrice,item.currency),equivalent,"price"),
      infoBlock("Est. landed / unit",landed?pounds(landed.total):"—",landed?"Incl. editable shipping and import allowance":"Live FX rate or supplier price unavailable","price"),
      infoBlock("Reported quantity",item.quantity.toLocaleString("en-GB"),item.status),
      infoBlock("Condition",item.condition),
      infoBlock("Lead time",item.delivery)
    );
    const footer=document.createElement("div");
    footer.className="offer-card-footer";
    const margin=profit(item);
    const profitBox=document.createElement("div");
    profitBox.appendChild(infoBlock("Est. gross profit / unit",margin?pounds(margin.gross):"—",
      margin?margin.margin.toFixed(1)+"% estimated margin":"Set selling price and exchange rate",
      margin?(margin.gross>=0?"gain":"loss"):""));
    const updated=document.createElement("div");
    updated.className="offer-card-note";
    updated.textContent="Updated "+dateStamp(item.updatedAt);
    footer.append(profitBox,updated);
    card.append(header,part,grid,footer);
    frag.appendChild(card);
  }
  container.replaceChildren(frag);
  const more=byId("moreOffersButton");
  more.hidden=rows.length<=state.mobileVisible;
  if(!more.hidden) more.textContent="Show 20 more ("+(rows.length-state.mobileVisible)+" remaining)";
}

function resetView() {
  state.data=null;state.filtered=[];state.mobileVisible=20;
  byId("offerCards").replaceChildren();
  byId("moreOffersButton").hidden=true;
  byId("opportunities").hidden=true;
  byId("topOpportunities").replaceChildren();
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
    case "best": {
      const ranks=rankedOffers(rows);
      const rankMap=new Map(ranks.map((item,index)=>[item.id+"|"+item.supplier+"|"+item.mpn,index]));
      rows.sort((a,b)=>{
        const aRank=rankMap.get(a.id+"|"+a.supplier+"|"+a.mpn)??Infinity;
        const bRank=rankMap.get(b.id+"|"+b.supplier+"|"+b.mpn)??Infinity;
        return aRank-bRank || b.quantity-a.quantity;
      });
      break;
    }
    case "landed": rows.sort((a,b)=>(landedDetails(a)?.total??Infinity)-(landedDetails(b)?.total??Infinity) || b.quantity-a.quantity);break;
    case "price": rows.sort((a,b)=>(gbpCost(a)??Infinity)-(gbpCost(b)??Infinity) || b.quantity-a.quantity);break;
    case "updated": rows.sort((a,b)=>Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0));break;
    case "supplier": rows.sort((a,b)=>a.supplier.localeCompare(b.supplier));break;
    default: rows.sort((a,b)=>b.quantity-a.quantity);
  }
  state.filtered=rows;
  updateFxWarning();
  renderOpportunities(rows);
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
    domCell(tr,money(item.unitPrice,item.currency),"mono",cost!==null && item.currency!=="GBP"?"≈ "+pounds(cost)+" at automatic FX":item.status);
    const landed=landedDetails(item);
    domCell(tr,landed?pounds(landed.total):"—","mono",landed?"Inc. shipping & import provision":"Currency / price unavailable");
    const p=profit(item);
    if(p) {
      const cell=domCell(tr,pounds(p.gross),p.gross>=0?"gain":"loss",p.margin.toFixed(1)+"% indicative margin");
      cell.title="Estimated gross profit per unit before VAT treatment and unentered costs.";
    } else {
      const reason=item.unitPrice===null?"Price not supplied":item.currency!=="GBP" && rate(item.currency)===null?"FX unavailable":"Enter target sale price";
      domCell(tr,"—","",reason);
    }
    frag.appendChild(tr);
  }
  byId("resultsBody").replaceChildren(frag);
  renderMobileCards(rows);
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
    state.mobileVisible=20;
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
    "Supplier | Country | Part | Condition | Qty | Unit price | Est landed GBP | Est gross profit"];
  for(const x of state.filtered.slice(0,40)){
    const p=profit(x);
    parts.push([x.supplier,x.supplierCountry,x.mpn,x.condition,x.quantity,money(x.unitPrice,x.currency),landedDetails(x)?pounds(landedDetails(x).total):"—",p?pounds(p.gross):"—"].join(" | "));
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
for(const id of ["conditionFilter","locationFilter","sortFilter","pricedOnly","resaleGbp","additionalGbp","feesPct","shipUk","shipEu","shipOther","importAllowancePct"]){
  byId(id).addEventListener("input",()=>{
    if(["conditionFilter","locationFilter","sortFilter","pricedOnly"].includes(id)) state.mobileVisible=20;
    updateFxWarning();
    if(state.data)applyFilters();
  });
}
byId("moreOffersButton").addEventListener("click",()=>{
  state.mobileVisible+=20;
  if(state.data)renderMobileCards(state.filtered);
});
const filterDetail=byId("filtersDetails");
const mq=window.matchMedia("(max-width:760px)");
filterDetail.open=!mq.matches;
if(mq.addEventListener)mq.addEventListener("change",event=>{filterDetail.open=!event.matches;});
updateFxWarning();
byId("copyButton").addEventListener("click",copyShortlist);
resetView();
const saved=sessionStorage.getItem("aoSupplierDeskKey")||sessionStorage.getItem("aoDealDeskKey");
if(saved) unlock(saved,true);
