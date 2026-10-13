(() => {
"use strict";
const $=id=>document.getElementById(id);
const state={key:"",requests:[],metrics:{},pilot:{},pilotParts:[],current:""};
function notify(msg,kind="success"){$("desk-message").textContent=msg;$("desk-message").dataset.kind=kind;}
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x;}
function currency(x){return Number(x||0).toLocaleString("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:2});}
async function api(method="GET",payload){
 const response=await fetch("/api/quick-check-admin",{
   method,headers:{"x-deal-desk-key":state.key,...(payload?{"Content-Type":"application/json"}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.ok)throw Error(data.error||"Could not load data");
 return data;
}
async function copy(text){
 try{await navigator.clipboard.writeText(text);notify("Copied. Paste into Outlook and check it before sending.");}
 catch{notify("Copy unavailable in this browser. Select the draft text and copy manually.","error");}
}
function mailto(email,subject,body){const url="mailto:"+encodeURIComponent(email)+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);window.location.href=url;}
function metricCards(){
 const m=state.metrics;
 const stats=[["Enquiries",m.enquiries],["Open",m.active],["Quotes",m.quotes],["Orders won",m.orders],["Gross profit",currency(m.grossProfit)],["Research mins",m.totalResearchMinutes||0],["Verified on enquiries",m.partsWithCurrentEvidence||0],["Research queue",m.partsWithoutCurrentEvidence||0]];
 $("desk-metrics").replaceChildren(...stats.map(([label,n])=>{
   const d=el("div","desk-stat");d.append(el("b","",n),el("span","",label));return d;
 }));
}
function pilotCards(){
 const p=state.pilot||{};
 $("pilot-count").textContent=String(p.current||0)+" / "+String(p.total||0)+" current evidence";
 const entries=[["Part numbers",p.total],["Sourced records",p.sourced],["Current evidence",p.current],["Needs research",p.unknown]];
 $("pilot-stats").replaceChildren(...entries.map(([name,val])=>{
  const card=el("div","desk-stat");card.append(el("b","",val||0),el("span","",name));return card;
 }));
 renderPilotParts();
}
function renderPilotParts(){
 const raw=$("pilot-filter").value.trim().toUpperCase().replace(/\s+/g,"");
 const selectedMake=$("pilot-make").value;
 const records=state.pilotParts.filter(p=>
  (selectedMake==="all"||p.manufacturer===selectedMake)&&
  (!raw||p.code.toUpperCase().replace(/\s+/g,"").includes(raw)));
 const box=$("pilot-results");box.replaceChildren();
 if(!records.length){box.append(el("p","desk-muted","No matching part numbers in this 100-part sample."));return;}
 for(const p of records.slice(0,100)){
  const card=el("div","desk-part");
  const heading=el("strong","",p.code+" · "+p.manufacturer);
  const status=p.source?(p.lifecycle+" · published manufacturer source · "+p.region):"Unknown — check · requires research";
  card.append(heading,el("p","",status));
  if(p.successor)card.append(el("p","","Suggested successor: "+p.successor+" (compatibility unverified)"));
  if(p.source){
   const link=el("a","","View official manufacturer evidence ↗");
   link.href=p.source;link.target="_blank";link.rel="noopener noreferrer";card.append(link);
  }
  const controls=el("div","desk-actions");
  const search=el("a","desk-tag","Check this part");search.href="/obsolescence-check.html?part="+encodeURIComponent(p.code)+"&make="+encodeURIComponent(p.manufacturer);
  const quote=el("a","desk-tag","Request spare quote");quote.href="/obsolete-parts-sourcing.html?part="+encodeURIComponent(p.code)+"&utm_source=quick_check_pilot";
  controls.append(search,quote);card.append(controls);box.append(card);
 }
}

function selected(){return state.requests.find(x=>x.id===state.current);}
function listCards(){
 const q=$("desk-search").value.toLowerCase().trim();
 const filtered=state.requests.filter(x=>[x.reference,x.name,x.company,x.partNumbers,x.email,x.urgency].join(" ").toLowerCase().includes(q));
 const holder=$("desk-list");holder.replaceChildren();
 if(!filtered.length){holder.append(el("p","desk-muted","No matching enquiries."));return;}
 for(const item of filtered){
  const button=el("button","desk-lead");
  button.type="button";button.setAttribute("aria-pressed",String(state.current===item.id));
  const title=el("b","",(item.company||item.name||"New contact")+" · "+item.reference);
  const details=el("small","",item.urgency+" · "+item.status+" · "+new Date(item.submitted).toLocaleDateString("en-GB"));
  const parts=el("small","",item.partNumbers.split("\n").map(v=>v.split(" | ")[0]).join(" / "));
  button.append(title,details,parts);
  button.addEventListener("click",()=>{state.current=item.id;listCards();renderDetail();});
  holder.append(button);
 }
}
function partButtons(item){
 const h=$("desk-parts");h.replaceChildren();
 for(const line of item.report.lines){
   const card=el("div","desk-part");
   card.append(el("strong","",line.code+" · "+line.manufacturer));
   card.append(el("p","",line.lifecycle+" · "+line.risk+" supply-risk · "+line.availability));
   if(line.source){
    const a=el("a","",line.source);
    a.href=line.source;a.target="_blank";a.rel="noopener noreferrer";
    card.append(a);
   }else card.append(el("p","", "Official status not verified yet"));
   const actions=el("div","desk-actions");
   const b=el("button","secondary","Review this part");b.type="button";
   b.addEventListener("click",()=>{
      $("v-code").value=line.code;
      $("v-make").value=["Siemens","Allen-Bradley","Mitsubishi","Omron","Other"].includes(line.manufacturer)?line.manufacturer:"Siemens";
      $("v-status").value=line.lifecycle;
      $("v-supply").value=line.availability;
      $("v-source").value=line.source||"";
      $("v-successor").value=line.successor==="Not verified"||line.successor==="Not published/confirmed"?"":line.successor;
      $("v-notes").value=line.notes||"";
      $("v-source").focus();
   });
   actions.append(b);card.append(actions);h.append(card);
 }
}
function followupText(item,kind){
 if(!item?.marketingConsent||!item.unsubscribeUrl)return "";
 const first=(item.name||"there").split(" ")[0];
 const headings={
   A3:"Can we help source your reviewed spares?",
   A4:"Next step for your ageing automation equipment",
   A5:"Automation spares update — your wanted parts"
 };
 const bodies={
   A3:"Following your recent Quick Check, do you need a quote for any of the parts reviewed? Reply with the required order codes and quantities, and I'll check availability and condition before quoting.",
   A4:"If you'd like to prioritise a full production line rather than just a few parts, our Essential Obsolescence Audit starts at £195 for up to 20 components. Happy to confirm the scope first. If you just need a spare, send the order code and I'll check sourcing routes.",
   A5:"We're keeping an eye on suitable automation spares as stock becomes available. If your requirements or preferred brands have changed, reply with an updated wanted list. This isn't a stock-availability guarantee."
 };
 return "To: "+item.email+"\nSubject: "+headings[kind]+"\n\nHi "+first+",\n\n"+bodies[kind]+
 "\n\nRob\nAutomation Outlet\ninfo@automation-outlet.co.uk\n\nUnsubscribe from optional updates: "+item.unsubscribeUrl;
}
function updateFollowup(){
 const item=selected(),value=$("desk-followup").value;
 const permitted=Boolean(item?.marketingConsent&&item.unsubscribeUrl&&item.sentAt);
 $("desk-followup-preview").textContent=permitted?
   followupText(item,value):"Not available: written marketing consent and a recorded manual summary send are both required.";
 $("desk-copy-followup").disabled=!permitted;
}

function renderDetail(){
 const item=selected();
 for(const id of ["desk-controls","desk-verify-panel","desk-draft-panel","desk-ack-panel","desk-actions-panel","desk-marketing-panel"])$(id).hidden=!item;
 if(!item)return;
 $("desk-reference").textContent=item.reference+" · "+new Date(item.submitted).toLocaleString("en-GB");
 $("desk-name").textContent=item.name+(item.company?" — "+item.company:"");
 $("desk-meta").textContent=item.email+" · "+(item.phone||"No telephone")+" · "+item.urgency+" · "+item.intent+
   (item.machine?" · "+item.machine:"")+(item.marketingConsent?" · Marketing opted in":" · No marketing opt-in");
 partButtons(item);
 updateFollowup();
 $("desk-ack").textContent="To: "+item.acknowledgement.email+"\nSubject: "+item.acknowledgement.subject+"\n\n"+item.acknowledgement.body;
 $("desk-ready").textContent=item.report.ready?
  (item.report.lines.length===1?"The part has":"All "+item.report.lines.length+" parts have")+" current official-source records. Review stock information and approve the draft before sending.":
  item.report.pendingCount+" "+(item.report.pendingCount===1?"part needs":"parts need")+" source verification. Keep this draft internal until verified.";
 $("desk-report").textContent="To: "+item.report.email+"\nSubject: "+item.report.subject+"\n\n"+(item.draft||item.report.body);
 const approved=Boolean(item.reviewedAt&&["Summary ready","Summary sent","Quote requested","Quoted","Order won","Closed"].includes(item.status));
 $("desk-open-outlook-report").disabled=!approved;
 $("desk-copy-report").disabled=!approved;
 $("desk-print-report").disabled=!approved;
 $("desk-ready").textContent+=approved?" Approved for manual delivery.":" Report copy/print disabled until status is approved as Summary ready.";
 $("desk-accept-unknown").checked=false;
 $("desk-status").value=item.status||"New";
 $("desk-quote").value=item.quoteValue||"";
 $("desk-profit").value=item.orderGrossProfit||"";
 $("desk-research-minutes").value=item.researchMinutes??"";
 $("desk-notes").value=item.notes||"";
 $("v-code").value="";
 $("v-source").value="";
 $("v-successor").value="";
 $("v-notes").value="";
 $("v-status").value="Unknown — check";
 $("v-supply").value="Not checked";
}
async function reload(preserve){
 const data=await api();
 state.requests=data.requests;state.metrics=data.metrics;state.pilot=data.pilot||{};state.pilotParts=data.pilotParts||[];
 if(!preserve||!state.requests.some(x=>x.id===state.current))state.current=state.requests[0]?.id||"";
 metricCards();pilotCards();listCards();renderDetail();
}
$("desk-login").addEventListener("submit",async e=>{
 e.preventDefault();state.key=$("desk-key").value;$("desk-key").value="";
 try{await reload(false);$("desk-gate").hidden=true;$("desk-content").hidden=false;notify("Review desk loaded. No emails have been sent.");}
 catch(err){state.key="";notify(err.message,"error");}
});
$("desk-search").addEventListener("input",listCards);
$("pilot-filter").addEventListener("input",renderPilotParts);
$("pilot-make").addEventListener("change",renderPilotParts);
$("desk-refresh").addEventListener("click",async()=>{try{await reload(true);notify("Enquiries and lifecycle cache refreshed.");}catch(e){notify(e.message,"error");}});
$("desk-research-rockwell").addEventListener("click",async()=>{
 const code=$("v-code").value.trim().toUpperCase();
 if($("v-make").value!=="Allen-Bradley"){notify("Select Allen-Bradley to use the official Rockwell product-page researcher.","error");return;}
 if(!/^[A-Z0-9-]{5,40}$/.test(code)){notify("Enter the exact Rockwell order code before researching.","error");return;}
 const button=$("desk-research-rockwell");
 button.disabled=true;
 try{
  const result=await api("POST",{action:"researchPart",code});
  const data=result.research;
  if(data?.status!=="suggested"){
    notify(data?.message||"No reliable exact result returned; verify manually.","error");return;
  }
  $("v-code").value=data.code;
  $("v-status").value=data.lifecycle;
  $("v-source").value=data.url;
  $("v-successor").value=data.suggestedSuccessor||"";
  $("v-notes").value=("Research suggestion on "+new Date(data.checkedAt).toLocaleDateString("en-GB")+
   ". Published status: "+data.reportedStatus+
   (data.discontinuedDate?", discontinued "+data.discontinuedDate:"")+
   ". Human reviewed official page and exact revision: PENDING").slice(0,500);
  $("v-source").focus();
  notify("Official page suggests "+data.lifecycle+". Check the linked manufacturer page, edit the note, then explicitly Save verified record. Nothing has been stored yet.");
 }catch(error){notify(error.message,"error");}
 finally{button.disabled=false;}
});
$("desk-verify-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!selected())return;
 const payload={action:"verifyPart",code:$("v-code").value,manufacturer:$("v-make").value,
   lifecycle:$("v-status").value,availability:$("v-supply").value,
   source:$("v-source").value,successor:$("v-successor").value,notes:$("v-notes").value};
 try{const r=await api("POST",payload);await reload(true);notify("Saved "+r.part+" in the verified lifecycle cache. Review draft updated.");}
 catch(err){notify(err.message,"error");}
});
// The Outlook web compose deep link creates a draft — sending always requires an Outlook action.
// Keep short enough for reliable deep links. Longer reports remain available via Copy / Print.
$("desk-open-outlook-report").addEventListener("click",()=>{
 const item=selected();
 const approved=Boolean(item?.reviewedAt&&["Summary ready","Summary sent","Quote requested","Quoted","Order won","Closed"].includes(item.status));
 if(!approved){notify("Please review and approve the report first.","error");return;}
 const body=item.draft||item.report.body;
 const url="https://outlook.office.com/mail/deeplink/compose?to="+encodeURIComponent(item.email)+
   "&subject="+encodeURIComponent(item.report.subject)+"&body="+encodeURIComponent(body);
 if(url.length>3500){notify("This report is too long for an Outlook draft link. Use Copy report and paste it into Outlook.","error");return;}
 window.open(url,"_blank","noopener,noreferrer");
 notify("Outlook draft opened for manual review. No message has been sent.");
});
$("desk-copy-report").addEventListener("click",()=>{
 const x=selected();if(x)copy("To: "+x.email+"\nSubject: "+x.report.subject+"\n\n"+(x.draft||x.report.body));
});
$("desk-print-report").addEventListener("click",()=>window.print());
$("desk-copy-ack").addEventListener("click",()=>{const x=selected();if(x)copy("To: "+x.email+"\nSubject: "+x.acknowledgement.subject+"\n\n"+x.acknowledgement.body);});
$("desk-mailto-ack").addEventListener("click",()=>{const x=selected();if(x)mailto(x.email,x.acknowledgement.subject,x.acknowledgement.body);});
$("desk-followup").addEventListener("change",updateFollowup);
$("desk-copy-followup").addEventListener("click",()=>{const item=selected();if(item?.marketingConsent&&item.unsubscribeUrl&&item.sentAt)copy(followupText(item,$("desk-followup").value));else notify("Verified marketing consent and a recorded summary send are required.","error");});
$("desk-save-status").addEventListener("click",async()=>{
 const x=selected();if(!x)return;
 const status=$("desk-status").value;
 if(status==="Summary sent"&&!confirm("Have you already manually emailed this reviewed summary to the customer?"))return;
 if(status==="Summary ready"&&!confirm("Have you checked every official source and the drafted wording? This saves an approved DRAFT; it does not send it."))return;
 const payload={action:"updateLead",id:x.id,status,notes:$("desk-notes").value,acceptUnknown:$("desk-accept-unknown").checked,
    quoteValue:$("desk-quote").value,orderGrossProfit:$("desk-profit").value,researchMinutes:$("desk-research-minutes").value};
 try{await api("POST",payload);await reload(true);notify("Progress saved: "+status+". No email was sent.");}
 catch(err){notify(err.message,"error");}
});
})();