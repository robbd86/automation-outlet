import test from "node:test";
import assert from "node:assert/strict";
import quickCheckHandler,{normaliseQuickCheck,validateQuickCheck,dayToken} from "../lib/obsolescence-check.mjs";

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

test("daily rate token is pseudonymous and rotates",()=>{
 const old=process.env.AO_DEAL_DESK_KEY;
 process.env.AO_DEAL_DESK_KEY="local-key";
 try{
  const req={headers:{"x-forwarded-for":"198.51.100.18"}};
  const a=dayToken(req,new Date("2026-10-13T12:00:00Z"));
  const b=dayToken(req,new Date("2026-10-14T12:00:00Z"));
  assert.match(a,/^[a-f0-9]{64}$/);
  assert.notEqual(a,b);
  assert.doesNotMatch(a,/198\.51/);
 }finally{if(old===undefined)delete process.env.AO_DEAL_DESK_KEY;else process.env.AO_DEAL_DESK_KEY=old;}
});
test("sixth same-IP submission is rejected without saving customer data or emailing",async()=>{
 const keys=["AIRTABLE_ACCESS_TOKEN","AO_QUICK_CHECK_BASE_ID","AO_QUICK_CHECK_TABLE_ID","AO_QUICK_CHECK_ENABLED","AO_DEAL_DESK_KEY","VERCEL_ENV","AO_QC_OWNER_NOTIFY_ENABLED","AO_QC_AUTOREPLY_ENABLED"];
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const priorFetch=globalThis.fetch;
 Object.assign(process.env,{AIRTABLE_ACCESS_TOKEN:"test",AO_QUICK_CHECK_BASE_ID:"app60WbULZ9PbuKQv",AO_QUICK_CHECK_TABLE_ID:"tblwv21sLnCvovQ9S",
   AO_QUICK_CHECK_ENABLED:"true",AO_DEAL_DESK_KEY:"local-secret",VERCEL_ENV:"preview",AO_QC_OWNER_NOTIFY_ENABLED:"true",AO_QC_AUTOREPLY_ENABLED:"true"});
 let attempts=0;
 globalThis.fetch=async(url,opts)=>{
  attempts++;
  assert.equal(opts.method,undefined,"must only check the read-only rate limit");
  assert.match(url,/filterByFormula/);
  return {ok:true,json:async()=>({records:Array.from({length:5},()=>({id:"x"}))})};
 };
 const res={statusCode:0,payload:null,setHeader(){return this},status(n){this.statusCode=n;return this},json(x){this.payload=x;return this},end(){return this}};
 try{
  await quickCheckHandler({method:"POST",headers:{"x-forwarded-for":"198.51.100.18"},body:good()},res);
  assert.equal(res.statusCode,429);assert.equal(attempts,1);
  assert.match(res.payload.error,/limit/i);
 }finally{
  globalThis.fetch=priorFetch;
  for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
 }
});


test("production acknowledgement uses AO sender and never sends an unapproved report",async()=>{
 const keys=["AIRTABLE_ACCESS_TOKEN","AO_QUICK_CHECK_BASE_ID","AO_QUICK_CHECK_TABLE_ID","AO_QUICK_CHECK_ENABLED","AO_DEAL_DESK_KEY","VERCEL_ENV","RESEND_API_KEY","AO_QC_AUTOREPLY_ENABLED","AO_QC_OWNER_NOTIFY_ENABLED"];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch;
 Object.assign(process.env,{AIRTABLE_ACCESS_TOKEN:"test",AO_QUICK_CHECK_BASE_ID:"app60WbULZ9PbuKQv",
 AO_QUICK_CHECK_TABLE_ID:"tblwv21sLnCvovQ9S",AO_QUICK_CHECK_ENABLED:"true",
 VERCEL_ENV:"production",RESEND_API_KEY:"test-resend-key",AO_QC_AUTOREPLY_ENABLED:"true",AO_QC_OWNER_NOTIFY_ENABLED:"false"});
 delete process.env.AO_DEAL_DESK_KEY;
 const requests=[];
 globalThis.fetch=async(url,opts)=>{
  requests.push({url,opts});
  return {ok:true,status:200,json:async()=>({id:"test"})};
 };
 const res={setHeader(){return this},status(n){this.code=n;return this},json(b){this.payload=b;return this},end(){return this}};
 try{
   await quickCheckHandler({method:"POST",headers:{},body:good()},res);
   assert.equal(res.code,200);
   assert.equal(requests.length,2,"only intake and one acknowledgement");
   assert.match(requests[0].url,/api.airtable.com/);
   assert.equal(requests[1].url,"https://api.resend.com/emails");
   const sent=JSON.parse(requests[1].opts.body);
   assert.equal(sent.from,"Automation Outlet <info@automation-outlet.co.uk>");
   assert.equal(sent.reply_to,"info@automation-outlet.co.uk");
   assert.equal(sent.to[0],"buyer@example.com");
   assert.match(sent.text,/two working days/);
   assert.doesNotMatch(sent.text,/Manufacturer lifecycle:/);
   assert.match(requests[1].opts.headers["Idempotency-Key"],/^ao-qc-ack-AQC-/);
 }finally{
   globalThis.fetch=oldFetch;
   for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 }
});


test("preview acknowledgements send only to the designated AO test inbox",async()=>{
 const keys=["AIRTABLE_ACCESS_TOKEN","AO_QUICK_CHECK_BASE_ID","AO_QUICK_CHECK_TABLE_ID","AO_QUICK_CHECK_ENABLED","AO_DEAL_DESK_KEY","VERCEL_ENV","RESEND_API_KEY","AO_QC_AUTOREPLY_ENABLED","AO_QC_TEST_RECIPIENT","AO_QC_OWNER_NOTIFY_ENABLED"];
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]])),before=globalThis.fetch;
 Object.assign(process.env,{AIRTABLE_ACCESS_TOKEN:"fake-token",AO_QUICK_CHECK_BASE_ID:"app60WbULZ9PbuKQv",
  AO_QUICK_CHECK_TABLE_ID:"tblwv21sLnCvovQ9S",AO_QUICK_CHECK_ENABLED:"true",VERCEL_ENV:"preview",
  RESEND_API_KEY:"test-only-secret",AO_QC_AUTOREPLY_ENABLED:"true",
  AO_QC_TEST_RECIPIENT:"info@automation-outlet.co.uk",AO_QC_OWNER_NOTIFY_ENABLED:"false"});
 delete process.env.AO_DEAL_DESK_KEY;
 const requests=[];
 globalThis.fetch=async(url,opts)=>{requests.push({url,opts});return {ok:true,status:200,json:async()=>({id:"test-id"})};};
 const makeRes=()=>({statusCode:0,setHeader(){return this},status(n){this.statusCode=n;return this},json(data){this.body=data;return this},end(){return this}});
 try{
  const outsider=makeRes();
  await quickCheckHandler({method:"POST",headers:{},body:good()},outsider);
  assert.equal(outsider.statusCode,200);
  assert.equal(requests.length,1,"non-AO preview request must not send email");
  const ownRequest=good();ownRequest.email="info@automation-outlet.co.uk";
  const owner=makeRes();
  await quickCheckHandler({method:"POST",headers:{},body:ownRequest},owner);
  assert.equal(owner.statusCode,200);
  assert.equal(requests.length,3,"owner request saves once and triggers exactly one acknowledgement");
  assert.equal(requests[2].url,"https://api.resend.com/emails");
  const sent=JSON.parse(requests[2].opts.body);
  assert.deepEqual(sent.to,["info@automation-outlet.co.uk"]);
  assert.match(sent.subject,/AO received your part numbers/);
  assert.equal(sent.from,"Automation Outlet <info@automation-outlet.co.uk>");
  process.env.AO_QC_TEST_RECIPIENT="buyer@example.com";
  await quickCheckHandler({method:"POST",headers:{},body:good()},makeRes());
  assert.equal(requests.length,4,"a misconfigured preview test recipient must not allow other addresses");
 }finally{
  globalThis.fetch=before;
  for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
 }
});
