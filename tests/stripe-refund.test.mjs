import test,{beforeEach,afterEach} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import webhook from "../api/stripe-webhook.mjs";

const sign="whsec_"+"refund_test", key="sk_"+"live_refund_test";
let oldFetch,oldKey,oldSign,oldGh;

function req(evt){
  const body=JSON.stringify(evt),t=Math.floor(Date.now()/1000);
  const sig=createHmac("sha256",sign).update(`${t}.${body}`).digest("hex");
  return new Request("https://ao.example/api/stripe-live-webhook",{method:"POST",body,headers:{"stripe-signature":`t=${t},v1=${sig}`}});
}
async function invoke(evt){const r=await webhook.fetch(req(evt));return{code:r.status,body:await r.json()};}
function marker(entry){return{body:"<!-- AO_INV_B64:"+Buffer.from(JSON.stringify(entry)).toString("base64")+" -->"};}
function session(status="awaiting_dispatch"){return{
  id:"cs_live_refund123",object:"checkout.session",livemode:true,mode:"payment",status:"complete",payment_status:"paid",currency:"gbp",
  metadata:{ao_environment:"live",ao_reservation_id:"aor_refund123",ao_order_status:status,ao_stock_action:"reduced",ao_order_issue:"902",ao_order_repo:"robbd86/automation-outlet-orders"}
};}
function refund({full=true,amount=2295,id="evt_refund"}={}){return{id,type:"charge.refunded",livemode:true,data:{object:{object:"charge",livemode:true,payment_intent:"pi_refund123",amount:2295,amount_refunded:amount,refunded:full,currency:"gbp"}}};}

beforeEach(()=>{oldFetch=global.fetch;oldKey=process.env.STRIPE_LIVE_SECRET_KEY;oldSign=process.env.STRIPE_LIVE_WEBHOOK_SECRET;oldGh=process.env.AO_GITHUB_TOKEN;process.env.STRIPE_LIVE_SECRET_KEY=key;process.env.STRIPE_LIVE_WEBHOOK_SECRET=sign;process.env.AO_GITHUB_TOKEN="github-test";delete process.env.STRIPE_SECRET_KEY;delete process.env.STRIPE_WEBHOOK_SECRET;});
afterEach(()=>{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.STRIPE_LIVE_SECRET_KEY;else process.env.STRIPE_LIVE_SECRET_KEY=oldKey;if(oldSign===undefined)delete process.env.STRIPE_LIVE_WEBHOOK_SECRET;else process.env.STRIPE_LIVE_WEBHOOK_SECRET=oldSign;if(oldGh===undefined)delete process.env.AO_GITHUB_TOKEN;else process.env.AO_GITHUB_TOKEN=oldGh;});

function mockRefund(status="awaiting_dispatch"){
  const stored=session(status),items=[{stockId:"stock-1",partNumber:"6ES7-TEST",quantity:1}];
  const comments=[marker({schema:1,kind:"reserve",reservationId:"aor_refund123",createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),items}),marker({schema:1,kind:"paid",reservationId:"aor_refund123",sessionId:stored.id,createdAt:new Date().toISOString(),items})];
  let issue={number:902,title:(status==="dispatched"?"DISPATCHED":"NEW")+" AO ORDER · £22.95 · Buyer",body:"# New Automation Outlet order\n- **Status:** Paid · "+(status==="dispatched"?"dispatched":"awaiting dispatch"),state:status==="dispatched"?"closed":"open"},releases=0;
  global.fetch=async(url,opt={})=>{
    const u=String(url);
    if(u.includes("/v1/checkout/sessions?"))return Response.json({data:[stored]});
    if(u.endsWith("/v1/checkout/sessions/"+stored.id)){if(opt.method==="POST"){for(const[k,v]of new URLSearchParams(opt.body)){const m=k.match(/^metadata\[(.+)\]$/);if(m)stored.metadata[m[1]]=v;}}return Response.json(stored);}
    if(u.includes("/issues/1/comments")){if(opt.method==="POST"){const p=JSON.parse(opt.body);if(/inventory release/.test(p.body))releases++;return Response.json({id:99,body:p.body},{status:201});}return Response.json(comments);}
    if(u.endsWith("/issues/902")){if(opt.method==="PATCH")issue={...issue,...JSON.parse(opt.body)};return Response.json(issue);}
    throw new Error("Unexpected "+u);
  };
  return{stored,get issue(){return issue;},get releases(){return releases;}};
}

test("full refund before dispatch restocks and closes order",async()=>{
  const m=mockRefund(),r=await invoke(refund());
  assert.equal(r.code,200);assert.equal(r.body.restocked,true);assert.equal(m.releases,1);
  assert.equal(m.stored.metadata.ao_order_status,"refunded");assert.equal(m.stored.metadata.ao_stock_action,"restocked");
  assert.match(m.issue.title,/^REFUNDED AO ORDER/);assert.equal(m.issue.state,"closed");
});

test("refund after dispatch requires stock review instead of auto-restock",async()=>{
  const m=mockRefund("dispatched"),r=await invoke(refund({id:"evt_refund_dispatched"}));
  assert.equal(r.code,200);assert.equal(r.body.restocked,false);assert.equal(r.body.requiresStockReview,true);assert.equal(m.releases,0);
  assert.equal(m.stored.metadata.ao_stock_action,"refund_review");
});

test("partial refund leaves stock unchanged and flags order",async()=>{
  const m=mockRefund(),r=await invoke(refund({full:false,amount:500,id:"evt_partial"}));
  assert.equal(r.code,200);assert.equal(r.body.full,false);assert.equal(m.releases,0);
  assert.equal(m.stored.metadata.ao_order_status,"partially_refunded");assert.equal(m.stored.metadata.ao_stock_action,"unchanged_partial_refund");
  assert.match(m.issue.title,/^PARTIAL REFUND AO ORDER/);assert.equal(m.issue.state,"open");
});
