import test from "node:test";
import assert from "node:assert/strict";
import quickCheckHandler,{normaliseQuickCheck,validateQuickCheck} from "../lib/obsolescence-check.mjs";

const good=()=>({
  parts:[{code:" 6es7 315-2ag10-0ab0 ",manufacturer:"Siemens",quantity:"2"}],
  name:"Factory Buyer",email:"buyer@example.com",urgency:"Planning ahead",
  intent:"Check lifecycle",processingConsent:true,marketingConsent:false
});
test("normalises full order code, quantity and email",()=>{
  const p=normaliseQuickCheck(good());
  assert.equal(p.parts[0].code,"6ES7 315-2AG10-0AB0");
  assert.equal(p.parts[0].quantity,2);
  assert.equal(p.email,"buyer@example.com");
  assert.equal(p.marketingConsent,false);
  assert.equal(validateQuickCheck(p),"");
});
test("rejects malformed codes, over limit, duplicates and bad quantity",()=>{
  const p=good();p.parts=[{code:"1234"},{code:"1 2 3 4"}];
  assert.match(validateQuickCheck(normaliseQuickCheck(p)),/duplicate/i);
  p.parts=Array.from({length:6},(_,i)=>({code:"1747-L54"+i}));
  assert.match(validateQuickCheck(normaliseQuickCheck(p)),/between 1 and 5/i);
  p.parts=[{code:"<>XX"}];
  assert.match(validateQuickCheck(normaliseQuickCheck(p)),/Part numbers/i);
  p.parts=[{code:"1747-L542",quantity:1000}];
  assert.match(validateQuickCheck(normaliseQuickCheck(p)),/Quantity/i);
});
test("requires request processing but never assumes marketing consent",()=>{
  const a=good();delete a.processingConsent;
  assert.match(validateQuickCheck(normaliseQuickCheck(a)),/confirm/i);
  a.processingConsent=true;
  assert.equal(normaliseQuickCheck(a).marketingConsent,false);
});
test("requires urgency, intent, identity and email",()=>{
  const a=good();a.urgency="Broken";
  assert.match(validateQuickCheck(normaliseQuickCheck(a)),/urgent/i);
  a.urgency="Planning ahead";a.intent="";
  assert.match(validateQuickCheck(normaliseQuickCheck(a)),/help/i);
  a.intent="Check lifecycle";a.email="invalid";
  assert.match(validateQuickCheck(normaliseQuickCheck(a)),/email/i);
});
test("unknown manufacturer is never inferred",()=>{
  const a=good();a.parts[0].manufacturer="Invented";
  assert.equal(normaliseQuickCheck(a).parts[0].manufacturer,"Not sure");
});

test("stores a permitted buyer enquiry without triggering outgoing email",async()=>{
  const oldFetch=globalThis.fetch;
  const before={
    token:process.env.AIRTABLE_ACCESS_TOKEN,
    base:process.env.AO_QUICK_CHECK_BASE_ID,
    table:process.env.AO_QUICK_CHECK_TABLE_ID,
    enabled:process.env.AO_QUICK_CHECK_ENABLED
  };
  process.env.AIRTABLE_ACCESS_TOKEN="test-token";
  process.env.AO_QUICK_CHECK_BASE_ID="app60WbULZ9PbuKQv";
  process.env.AO_QUICK_CHECK_TABLE_ID="tblwv21sLnCvovQ9S";
  process.env.AO_QUICK_CHECK_ENABLED="true";
  let calls=0,stored;
  globalThis.fetch=async(url,init)=>{
    calls++;
    assert.match(url,/api.airtable.com\/v0/);
    stored=JSON.parse(init.body).records[0].fields;
    return {ok:true,status:200};
  };
  const res={
    statusCode:0,payload:null,
    setHeader(){return this;},
    status(code){this.statusCode=code;return this;},
    json(body){this.payload=body;return this;},
    end(){return this;}
  };
  try{
    await quickCheckHandler({method:"POST",headers:{},body:good()},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.payload.ok,true);
    assert.equal(calls,1,"only Airtable storage, no outgoing email");
    assert.equal(stored["Marketing Consent"],false);
    assert.equal(stored["Help Needed"],"Check lifecycle");
    assert.match(stored["Part Numbers"],/6ES7 315/);
  }finally{
    globalThis.fetch=oldFetch;
    for(const [key,name] of Object.entries({token:"AIRTABLE_ACCESS_TOKEN",base:"AO_QUICK_CHECK_BASE_ID",table:"AO_QUICK_CHECK_TABLE_ID",enabled:"AO_QUICK_CHECK_ENABLED"})){
      if(before[key]===undefined)delete process.env[name];else process.env[name]=before[key];
    }
  }
});
