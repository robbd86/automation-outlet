const API="/api/deal-desk?view=orders";
const keyStore="aoStockManagerKey";
let managerKey=sessionStorage.getItem(keyStore)||"";
const el=(id)=>document.getElementById(id);
const gbp=(currency,value)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:String(currency||"GBP").toUpperCase()}).format((Number(value)||0)/100);

function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function setStatus(target,message,error=false){target.textContent=message;target.style.color=error?"#ff9d9d":"var(--blue-bright)";}
function dateTime(seconds){if(!seconds)return"Unknown time";return new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(Number(seconds)*1000));}
function address(shipping){const a=shipping?.address;if(!a)return"Not supplied";return [a.line1,a.line2,a.city,a.postalCode,a.country].filter(Boolean).map(esc).join("<br>");}
function prettyStatus(value){return String(value||"pending").replaceAll("_"," ");}

async function load(){
 setStatus(el("status"),"Loading Stripe sandbox orders…");
 const response=await fetch(API,{headers:{Accept:"application/json","x-deal-desk-key":managerKey}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||"Could not load orders.");
 render(Array.isArray(data.orders)?data.orders:[]);
 el("lockPanel").classList.add("hidden");el("ordersPanel").classList.remove("hidden");setStatus(el("status"),"");
}

async function setOrderStatus(sessionId,orderStatus,button){
 button.disabled=true;button.textContent="Updating…";
 try{
  const response=await fetch(API,{method:"PATCH",headers:{Accept:"application/json","Content-Type":"application/json","x-deal-desk-key":managerKey},body:JSON.stringify({sessionId,orderStatus})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Could not update order.");
  await load();
 }catch(error){
  button.disabled=false;button.textContent="Mark dispatched";setStatus(el("status"),error.message,true);
 }
}

function render(orders){
 const list=el("ordersList");list.replaceChildren();
 if(!orders.length){list.innerHTML='<div class="panel empty">No Automation Outlet sandbox orders found yet.</div>';return;}
 for(const order of orders){
  const article=document.createElement("article");article.className="order";
  const items=(order.items||[]).map(item=>'<div class="item"><div><strong>'+esc(item.partNumber||item.description)+'</strong><div class="muted">'+esc(item.description)+(item.stockId?'<br><span class="mono">'+esc(item.stockId)+'</span>':'')+'</div></div><div>'+esc(item.quantity)+' × '+gbp(item.currency,item.quantity?item.amountTotal/item.quantity:item.amountTotal)+'</div></div>').join("");
  const customer=order.customer||{};
  const shippingLabel=Number(order.shippingAmount)===0?"FREE":gbp(order.currency,order.shippingAmount);
  const dispatchButton=order.paymentStatus==="paid"&&order.orderStatus!=="dispatched"?'<button class="btn" type="button" data-dispatch="'+esc(order.id)+'">Mark dispatched</button>':'';
  const notificationRepo=String(order.notificationRepo||"").replace(/[^A-Za-z0-9_.\/-]/g,"");
  const notificationLink=order.notificationIssue&&notificationRepo?'<a class="pill good" target="_blank" rel="noopener" href="https://github.com/'+esc(notificationRepo)+'/issues/'+esc(order.notificationIssue)+'">AO notification #'+esc(order.notificationIssue)+'</a>':'';
  article.innerHTML='<div class="order-top"><div><h2>'+esc(dateTime(order.created))+'</h2><div class="mono">'+esc(order.id)+'</div><div class="badges"><span class="pill '+(order.paymentStatus==="paid"?"good":"wait")+'">Payment: '+esc(order.paymentStatus||"unknown")+'</span><span class="pill '+(order.webhookAcknowledged?"good":"wait")+'">Webhook: '+(order.webhookAcknowledged?"acknowledged":"pending")+'</span><span class="pill">Stock: '+esc(order.stockAction||"pending")+'</span><span class="pill">Order: '+esc(prettyStatus(order.orderStatus))+'</span><span class="pill">Shipping: '+esc(shippingLabel)+'</span>'+notificationLink+'</div></div><div><div class="total">'+gbp(order.currency,order.amountTotal)+'</div>'+dispatchButton+'</div></div><div class="order-grid"><div><h3>Items</h3><div class="order-items">'+(items||'<div class="muted">No line items returned.</div>')+'</div></div><div><h3>Customer / delivery</h3><div class="customer">'+esc(customer.name||"Name not supplied")+'<br>'+esc(customer.email||"Email not supplied")+(customer.phone?'<br>'+esc(customer.phone):'')+'</div><div class="address muted" style="margin-top:.7rem">'+address(order.shipping)+'</div></div></div>';
  const button=article.querySelector("[data-dispatch]");
  if(button)button.addEventListener("click",()=>setOrderStatus(order.id,"dispatched",button));
  list.appendChild(article);
 }
}

el("unlockForm").addEventListener("submit",async(event)=>{event.preventDefault();managerKey=el("managerKey").value;setStatus(el("unlockStatus"),"Opening…");try{await load();sessionStorage.setItem(keyStore,managerKey);setStatus(el("unlockStatus"),"");}catch(error){setStatus(el("unlockStatus"),error.message,true);}});
el("refreshBtn").addEventListener("click",()=>load().catch(error=>setStatus(el("status"),error.message,true)));
el("lockBtn").addEventListener("click",()=>{sessionStorage.removeItem(keyStore);managerKey="";el("ordersPanel").classList.add("hidden");el("lockPanel").classList.remove("hidden");el("managerKey").value="";});
if(managerKey){load().catch(()=>{sessionStorage.removeItem(keyStore);managerKey="";el("ordersPanel").classList.add("hidden");el("lockPanel").classList.remove("hidden");});}
