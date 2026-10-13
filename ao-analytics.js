/* AO optional analytics. No trackers/cookies are loaded without an affirmative opt-in.
   No name, email, phone, free-text part search, exact enquiry contents or Stripe IDs are sent. */
(() => {
  "use strict";
  const CONSENT_KEY = "ao.analytics.consent.v1";
  const ALLOWED_EVENTS = new Set([
    "generate_lead","quote_request_open","stock_search","contact_click",
    "add_to_cart","begin_checkout","purchase","buyer_alert_interest"
  ]);
  let id = "";
  let enabled = false;
  let setup = false;
  let consent = "";
  let queued = [];
  const defaultChoice = () => {
    try {
      const v = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
      if (v && (v.choice==="granted"||v.choice==="denied") &&
          Number.isFinite(v.date) && Date.now()-v.date < 180*86400000) return v.choice;
    } catch (_) {}
    return "";
  };
  consent = defaultChoice();

  function cleanParams(type, properties) {
    const p = properties && typeof properties==="object" ? properties : {};
    const out = {};
    if (type==="generate_lead" && ["sourcing","seller","consignment","contact","buyer_alert","factory_pilot","quick_check"].includes(p.lead_type)) out.lead_type=p.lead_type;
    if (type==="quote_request_open") out.quote_type="sourcing";
    if (type==="stock_search") {
      out.search_area="current_stock";
      if ([3,4,5,6,7,8,9,10,11,12].includes(p.length_bucket)) out.length_bucket=p.length_bucket;
      else out.length_bucket=12;
    }
    if (type==="contact_click" && ["whatsapp","email"].includes(p.method)) out.method=p.method;
    if (type==="add_to_cart") {
      if (Number.isFinite(p.value) && p.value>=0 && p.value<=1000000) out.value=Math.round(p.value*100)/100;
      out.currency="GBP";
      if (Number.isInteger(p.quantity)&&p.quantity>=1&&p.quantity<=99)out.quantity=p.quantity;
    }
    if (type==="begin_checkout") out.currency="GBP";
    if (type==="purchase") {
      if (typeof p.transaction_id!=="string" || !/^ao_[a-f0-9]{24}$/.test(p.transaction_id))return null;
      if (!Number.isFinite(p.value)||p.value<0||p.value>1000000)return null;
      out.transaction_id=p.transaction_id;
      out.value=Math.round(p.value*100)/100;
      out.currency=p.currency==="GBP"?"GBP":p.currency==="USD"?"USD":p.currency==="EUR"?"EUR":"GBP";
    }
    return out;
  }
  function send(name, params) {
    if(!enabled || typeof window.gtag!=="function")return;
    window.gtag("event",name,params);
  }
  function track(name,params={}) {
    if (!ALLOWED_EVENTS.has(name) || consent!=="granted")return false;
    const safe = cleanParams(name,params);
    if (!safe)return false;
    if (enabled)send(name,safe);
    else if(queued.length<30)queued.push([name,safe]);
    return true;
  }
  window.AOAnalytics = {track,hasConsent:()=>consent==="granted",isConfigured:()=>Boolean(id)};
  function initialiseAnalytics() {
    if(setup){
      if(consent==="granted"){
        window.gtag?.("consent","update",{analytics_storage:"granted"});
        enabled=true;
        queued.splice(0).forEach(([name,properties])=>send(name,properties));
      }
      return;
    }
    if(consent!=="granted"||!id)return;
    setup=true;
    window.dataLayer=window.dataLayer||[];
    window.gtag=function(){window.dataLayer.push(arguments);};
    window.gtag("js",new Date());
    window.gtag("consent","default",{
      analytics_storage:"granted",ad_storage:"denied",
      ad_user_data:"denied",ad_personalization:"denied"
    });
    // Strip all query and fragment values (particularly Stripe session IDs)
    // from GA4 page_location. Also sanitise the source referrer.
    let referrer="";
    try{
      if(document.referrer){
        const ref=new URL(document.referrer);
        referrer=ref.origin+ref.pathname;
      }
    }catch(_){}
    // Preserve safe campaign attribution while excluding private URL values.
    const safeLocation=new URL(location.origin+location.pathname);
    const requested=new URLSearchParams(location.search);
    for(const key of ["utm_source","utm_medium","utm_campaign"]){
      const value=requested.get(key)||"";
      if(/^[a-zA-Z0-9_-]{1,70}$/.test(value))safeLocation.searchParams.set(key,value);
    }
    window.gtag("config",id,{
      send_page_view:true,anonymize_ip:true,
      page_location:safeLocation.toString(),
      page_referrer:referrer
    });
    const js=document.createElement("script");
    js.async=true;
    js.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(id);
    document.head.appendChild(js);
    enabled=true;
    queued.splice(0).forEach(([name,properties])=>send(name,properties));
  }
  function storeChoice(value) {
    consent=value;
    try{localStorage.setItem(CONSENT_KEY,JSON.stringify({choice:value,date:Date.now()}));}catch(_){}
    if(value==="granted")initialiseAnalytics();
    else {
      queued=[];
      if(setup && typeof window.gtag==="function"){
        window.gtag("consent","update",{analytics_storage:"denied"});
        enabled=false;
      }
    }
  }
  function consentUI() {
    const action=document.createElement("button");
    action.type="button";action.textContent="Privacy choices";
    action.className="ao-analytics-settings";
    action.setAttribute("aria-label","Change analytics privacy choices");
    const modal=document.createElement("section");
    modal.className="ao-analytics-banner";
    modal.setAttribute("role","region");
    modal.setAttribute("aria-label","Optional website analytics");
    const copy=document.createElement("p");
    copy.textContent="Can we use optional Google Analytics to understand visits, part enquiries and sales? We'll only load it if you agree. Essential shopping and enquiry forms work either way.";
    const more=document.createElement("a");
    more.href="/privacy.html";more.textContent="Privacy notice";
    const actions=document.createElement("div");actions.className="ao-analytics-actions";
    const no=document.createElement("button");no.type="button";no.textContent="Reject optional";
    const yes=document.createElement("button");yes.type="button";yes.textContent="Accept analytics";
    const hide=()=>{modal.hidden=true;action.hidden=false;};
    no.addEventListener("click",()=>{storeChoice("denied");hide();});
    yes.addEventListener("click",()=>{storeChoice("granted");hide();});
    action.addEventListener("click",()=>{modal.hidden=false;action.hidden=true;});
    actions.append(no,yes);
    modal.append(copy,more,actions);
    document.body.append(action,modal);
    if(consent){modal.hidden=true;action.hidden=false;}
    else{modal.hidden=false;action.hidden=true;}
  }
  const styles=document.createElement("style");
  styles.textContent=`
  .ao-analytics-banner,.ao-analytics-settings{font:15px/1.55 system-ui,sans-serif;box-sizing:border-box;position:fixed;z-index:110;background:#0c2038;color:#f3f8ff;border:1px solid #417daf;box-shadow:0 12px 50px #020710bb;}
  .ao-analytics-banner[hidden],.ao-analytics-settings[hidden]{display:none!important}
  .ao-analytics-banner{left:50%;bottom:12px;transform:translateX(-50%);width:min(calc(100% - 24px),670px);border-radius:13px;padding:16px 19px;}
  .ao-analytics-banner p{font:inherit;color:#e0edf9;margin:0 0 8px}
  .ao-analytics-banner a{color:#8bd2ff;font-size:13px}
  .ao-analytics-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:10px;flex-wrap:wrap}
  .ao-analytics-actions button,.ao-analytics-settings{cursor:pointer;font:600 13px system-ui,sans-serif;border-radius:8px;padding:11px 13px}
  .ao-analytics-actions button{background:#1b3550;color:white;border:1px solid #477195}
  .ao-analytics-actions button:last-child{background:#287fe5;border-color:#287fe5}
  .ao-analytics-settings{left:12px;bottom:12px;color:#d0e4f8;padding:8px 10px;opacity:.89}
  @media(max-width:560px){.ao-analytics-actions button{flex:1}.ao-analytics-banner{padding:13px 14px}.ao-analytics-settings{bottom:10px}}
  `;
  document.head.appendChild(styles);
  document.addEventListener("click",e=>{
    const a=e.target.closest?.("a[href]");
    if(!a)return;
    const href=a.getAttribute("href")||"";
    if(href.startsWith("https://wa.me/"))track("contact_click",{method:"whatsapp"});
    else if(href.startsWith("mailto:"))track("contact_click",{method:"email"});
    if(href.includes("/obsolete-parts-sourcing.html"))track("quote_request_open");
  },{passive:true});
  window.addEventListener("ao-cart-add",event=>{
    const item=event.detail||{};
    track("add_to_cart",{value:Number(item.price)*Number(item.quantity),quantity:item.quantity});
  });
  const input=document.getElementById("stockSearch");
  if(input) {
    let debounce;
    input.addEventListener("input",()=>{
      clearTimeout(debounce);
      const len=String(input.value||"").trim().length;
      if(len>=3)debounce=setTimeout(()=>track("stock_search",{length_bucket:Math.min(12,len)}),1100);
    });
  }
  fetch("/ao-ga4-config.json",{cache:"no-store"})
    .then(r=>r.ok?r.json():null)
    .then(v=>{
      const candidate=String(v?.measurementId||"");
      if(!/^G-[A-Z0-9]{5,15}$/.test(candidate))return;
      id=candidate;
      consentUI();
      initialiseAnalytics();
    }).catch(()=>{});
})();
