const API="/api/deal-desk?view=orders";
const keyStore="aoStockManagerKey";
let managerKey=sessionStorage.getItem(keyStore)||"";
const el=(id)=>document.getElementById(id);
const gbp=(currency,value)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:String(currency||"GBP").toUpperCase()}).format((Number(value)||0)/100);

function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function setStatus(target,message,error=false){target.textContent=message;target.style.color=error?"#ff9d9d":"var(--blue-bright)";}
function dateTime(seconds){if(!seconds)return"Unknown time";return new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(Number(seconds)*1000));}
function address(shipping){const a=shipping?.address;if(!a)return"Not supplied";return [a.line1,a.line2,a.city,a.postalCode,a.country].filter(Boolean).map(esc).join("<br>");}

async function load(){
 setStatus(el("status"),"Loading Stripe sandbox orders…");
 const response=await fetch(API,{headers:{Accept:"application/json","x-deal-desk-key":managerKey}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||"Could not load orders.");
 render(Array.isArray(data.orders)?data.orders:[]);
 el("lockPanel").classList.add("hidden");el("ordersPanel").classList.remove("hidden");setStatus(el("status"),"");
}

function render(orders){
 const list=el("ordersList");list.replaceChildren();
 if(!orders.length){list.innerHTML='<div class="panel empty">No Automation Outlet sandbox orders found yet.</div>';return;}
 for(const order of orders){
  const article=document.createElement("article");article.className="order";
  const items=(order.items||[]).map(item=>'<div class="item"><div><strong>'+esc(item.partNumber||item.description)+'</strong><div class="muted">'+esc(item.description)+(item.stockId?'<br><span class="mono">'+esc(item.stockId)+'</span>':'')+'</div></div><div>'+esc(item.quantity)+' × '+gbp(item.currency,item.quantity?item.amountTotal/item.quantity:item.amountTotal)+'</div></div>').join("");
  const customer=order.customer||{};
  const shippingLabel=Number(order.shippingAmount)===0?"FREE":gbp(order.currency,order.shippingAmount);
  article.innerHTML='<div class="order-top"><div><h2>'+esc(dateTime(order.created))+'</h2><div class="mono">'+esc(order.id)+'</div><div class="badges"><span class="pill '+(order.paymentStatus==="paid"?"good":"wait")+'">Payment: '+esc(order.paymentStatus||"unknown")+'</span><span class="pill '+(order.webhookAcknowledged?"good":"wait")+'">Webhook: '+(order.webhookAcknowledged?"acknowledged":"pending")+'</span><span class="pill">Stock: '+esc(order.stockAction||"pending")+'</span><span class="pill">Shipping: '+esc(shippingLabel)+'</span></div></div><div class="total">'+gbp(order.currency,order.amountTotal)+'</div></div><div class="order-grid"><div><h3>Items</h3><div class="order-items">'+(items||'<div class="muted">No line items returned.</div>')+'</div></div><div><h3>Customer / delivery</h3><div class="customer">'+esc(customer.name||"Name not supplied")+'<br>'+esc(customer.email||"Email not supplied")+(customer.phone?'<br>'+esc(customer.phone):'')+'</div><div class="address muted" style="margin-top:.7rem">'+address(order.shipping)+'</div></div></div>';
  list.appendChild(article);
 }
}

el("unlockForm").addEventListener("submit",async(event)=>{event.preventDefault();managerKey=el("managerKey").value;setStatus(el("unlockStatus"),"Opening…");try{await load();sessionStorage.setItem(keyStore,managerKey);setStatus(el("unlockStatus"),"");}catch(error){setStatus(el("unlockStatus"),error.message,true);}});
el("refreshBtn").addEventListener("click",()=>load().catch(error=>setStatus(el("status"),error.message,true)));
el("lockBtn").addEventListener("click",()=>{sessionStorage.removeItem(keyStore);managerKey="";el("ordersPanel").classList.add("hidden");el("lockPanel").classList.remove("hidden");el("managerKey").value="";});
if(managerKey){load().catch(()=>{sessionStorage.removeItem(keyStore);managerKey="";el("ordersPanel").classList.add("hidden");el("lockPanel").classList.remove("hidden");});}
