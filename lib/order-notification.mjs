const API_VERSION="2022-11-28";
const DEFAULT_REPO="robbd86/automation-outlet-site";
const LABEL="ao-order";

function cfg(){return{token:process.env.AO_GITHUB_TOKEN,repo:process.env.AO_GITHUB_REPO||DEFAULT_REPO,assignee:process.env.AO_ORDER_ASSIGNEE||"robbd86"};}

async function gh(path,options={}){
  const {token,repo}=cfg();
  if(!token){const e=new Error("Order notifications are not configured");e.status=503;throw e;}
  const r=await fetch(`https://api.github.com/repos/${repo}${path}`,{
    ...options,
    headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${token}`,"X-GitHub-Api-Version":API_VERSION,"User-Agent":"automation-outlet-orders",...(options.headers||{})},
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(data.message||"GitHub request failed");e.status=r.status;throw e;}
  return data;
}

const money=(p,c="gbp")=>new Intl.NumberFormat("en-GB",{style:"currency",currency:String(c||"gbp").toUpperCase()}).format((Number(p)||0)/100);
const clean=(v,f="—")=>String(v??"").trim()||f;
const marker=id=>`<!-- AO_ORDER_SESSION:${id} -->`;

function rows(session){
  const lines=Array.isArray(session.line_items?.data)?session.line_items.data:[];
  return lines.map(line=>{
    const product=line.price?.product&&typeof line.price.product==="object"?line.price.product:{};
    const part=product.metadata?.part_number||line.description||"Automation Outlet item";
    return `| ${clean(part)} | ${Number(line.quantity)||0} | ${money(line.amount_total,line.currency||session.currency)} |`;
  }).join("\n")||"| — | — | — |";
}

function address(session){
  const s=session.collected_information?.shipping_details||session.shipping_details||{};
  const a=s.address||{};
  return [s.name,a.line1,a.line2,a.city,a.postal_code,a.country].filter(Boolean).join("\n")||"No delivery address supplied.";
}

async function ensureLabel(){
  try{await gh("/labels",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:LABEL,color:"1677ff",description:"Automation Outlet paid website order"})});}
  catch(e){if(e.status!==422)throw e;}
}

async function findExisting(id){
  const issues=await gh(`/issues?state=all&labels=${encodeURIComponent(LABEL)}&per_page=100&sort=created&direction=desc`);
  return issues.find(i=>!i.pull_request&&String(i.body||"").includes(marker(id)))||null;
}

export async function createOrFindOrderNotification(session){
  const existing=await findExisting(session.id);
  if(existing)return existing;
  await ensureLabel();
  const customer=session.customer_details||{};
  const body=`# New Automation Outlet order

## Payment
- **Total paid:** ${money(session.amount_total,session.currency)}
- **Products:** ${money(session.amount_subtotal,session.currency)}
- **Shipping:** ${money(session.total_details?.amount_shipping,session.currency)}
- **Status:** Paid · awaiting dispatch
- **Stripe session:** \`${session.id}\`

## Items
| Part / item | Qty | Line total |
|---|---:|---:|
${rows(session)}

## Customer
- **Name:** ${clean(customer.name)}
- **Email:** ${clean(customer.email)}
- **Phone:** ${clean(customer.phone)}

## Delivery
${address(session)}

${marker(session.id)}
`;
  const {assignee}=cfg();
  return gh("/issues",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:`NEW AO ORDER · ${money(session.amount_total,session.currency)} · ${clean(customer.name,"Customer")}`,body,labels:[LABEL],assignees:assignee?[assignee]:[]})});
}

export async function updateOrderNotificationStatus(issueNumber,orderStatus){
  const n=Number(issueNumber);if(!Number.isInteger(n)||n<=0)return null;
  const issue=await gh(`/issues/${n}`);
  const tail=String(issue.title||"AO order").replace(/^(NEW AO ORDER|DISPATCHED AO ORDER)\s*·\s*/i,"");
  const dispatched=orderStatus==="dispatched";
  let body=String(issue.body||"");
  body=body.replace(/^# (?:New|Dispatched) Automation Outlet order/im,`# ${dispatched?"Dispatched":"New"} Automation Outlet order`);
  body=body.replace(/^- \*\*Status:\*\* .*$/im,`- **Status:** Paid · ${dispatched?"dispatched":"awaiting dispatch"}`);
  return gh(`/issues/${n}`,{
    method:"PATCH",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      title:`${dispatched?"DISPATCHED AO ORDER":"NEW AO ORDER"} · ${tail}`,
      body,
      state:dispatched?"closed":"open"
    })
  });
}
