import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../ao-analytics.js",import.meta.url),"utf8");

function environment(configId,chosen="") {
  const storage=new Map();
  if(chosen)storage.set("ao.analytics.consent.v1",JSON.stringify({choice:chosen,date:Date.now()}));
  const scripts=[];
  const element=(tag)=>({
    tag,children:[],hidden:false,attrs:{},listeners:{},className:"",textContent:"",
    append(...nodes){this.children.push(...nodes);},
    appendChild(node){this.children.push(node); if(node.tag==="script")scripts.push(node);},
    setAttribute(name,value){this.attrs[name]=value;},
    addEventListener(name,fn){this.listeners[name]=fn;},
  });
  const head=element("head"),body=element("body");
  const document={
    head,body,referrer:"https://www.google.com/search?q=do-not-track-this",
    createElement:element,getElementById:()=>null,addEventListener(){},
  };
  const window={addEventListener(){}};
  const context={document,window,
    location:{origin:"https://www.automation-outlet.co.uk",pathname:"/order-success.html",search:"?session_id=cs_live_PRIVATE_TOKEN"},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    fetch:()=>Promise.resolve({ok:true,json:()=>Promise.resolve({measurementId:configId})}),
    URL,URLSearchParams,Date,Number,String,Math,JSON,Promise,console,Set,Array,encodeURIComponent,clearTimeout,setTimeout,
  };
  vm.runInNewContext(source,context,{timeout:1500});
  return {scripts,storage,head,body,window,context};
}
const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

test("GA4 is never loaded without consent even if configured",async()=>{
  const x=environment("G-12345678");
  await settle();
  assert.equal(x.scripts.length,0);
  assert.equal(x.window.AOAnalytics.hasConsent(),false);
  assert.equal(x.window.AOAnalytics.track("generate_lead",{lead_type:"sourcing"}),false);
  assert.equal(x.body.children.length,2);
  assert.equal(x.body.children[1].hidden,false);
});
test("acceptance enables GA4 and removes Stripe identifiers from pageview",async()=>{
  const x=environment("G-12345678");
  await settle();
  const modal=x.body.children[1];
  const accept=modal.children[2].children[1];
  accept.listeners.click();
  assert.equal(x.scripts.length,1);
  assert.ok(x.scripts[0].src.includes("googletagmanager.com/gtag/js"));
  assert.equal(x.window.AOAnalytics.hasConsent(),true);
  const config=[...x.window.dataLayer].find(v=>v[0]==="config");
  assert.equal(config[2].page_location,"https://www.automation-outlet.co.uk/order-success.html");
  assert.equal(config[2].page_referrer,"https://www.google.com/search");
  assert.ok(!JSON.stringify([...x.window.dataLayer]).includes("cs_live_PRIVATE_TOKEN"));
  assert.ok(x.window.AOAnalytics.track("generate_lead",{lead_type:"sourcing"}));
  assert.equal([...x.window.dataLayer].filter(v=>v[0]==="event").length,1);
});
test("rejected analytics doesn't load scripts or send tracking",async()=>{
  const x=environment("G-12345678","denied");
  await settle();
  assert.equal(x.scripts.length,0);
  assert.equal(x.body.children[1].hidden,true);
  assert.equal(x.window.AOAnalytics.track("begin_checkout"),false);
});
test("missing property never shows consent UI or Google script",async()=>{
  const x=environment("");
  await settle();
  assert.equal(x.scripts.length,0);
  assert.equal(x.body.children.length,0);
  assert.equal(x.window.AOAnalytics.isConfigured(),false);
});
test("purchase IDs are hashed and only allowlisted dimensions are emitted",async()=>{
  const x=environment("G-12345678","granted");
  await settle();
  assert.equal(x.scripts.length,1);
  assert.equal(x.window.AOAnalytics.track("purchase",{transaction_id:"cs_live_LEAK",value:150}),false);
  assert.equal(x.window.AOAnalytics.track("purchase",{transaction_id:"ao_0123456789abcdef01234567",value:180,currency:"GBP",email:"private@example.com"}),true);
  const emitted=[...x.window.dataLayer].filter(v=>v[0]==="event");
  assert.equal(emitted.length,1);
  assert.equal(emitted[0][2].transaction_id,"ao_0123456789abcdef01234567");
  assert.equal(Object.hasOwn(emitted[0][2],"email"),false);
});
