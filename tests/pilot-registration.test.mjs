import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler,{normaliseRegistration,validateRegistration} from '../lib/pilot-registration.mjs';

const read = file=>readFileSync(file,'utf8');
const valid = {
  name:'Factory Pilot Test',company:'Example Engineering Ltd',
  email:'pilot-test@example.invalid',job_role:'Engineering manager',
  site_location:'Peterborough',phone:'',
  interest:'Find spares',equipment:'S7-300 CPU spares',
  consent:'yes',website:'',utm_source:'homepage'
};
function response(){
  let status=0,payload=null;
  return {
    setHeader(){return this;},status(code){status=code;return this;},
    json(data){payload=data;return {status,payload};},end(){return {status,payload};},
  };
}
function request(body,origin='https://www.automation-outlet.co.uk'){
  return {method:'POST',headers:{origin,host:'www.automation-outlet.co.uk','content-length':String(JSON.stringify(body).length)},body};
}

test('landing page uses one canonical URL, working route and accessible consent',()=>{
  const h=read('factory-spares-network.html');
  assert.match(h,/rel="canonical" href="https:\/\/www\.automation-outlet\.co\.uk\/factory-spares-network\.html"/);
  assert.match(h,/<link rel="stylesheet" href="\/pilot\.css">/);
  assert.match(h,/<form id="pilotSignup"/);
  assert.match(h,/fetch\("\/api\/pilot-signup"/);
  assert.match(h,/name="consent" value="yes" required/);
  assert.match(h,/name="interest" value="Find spares" required/);
  assert.match(h,/name="interest" value="Offer surplus"/);
  assert.match(h,/name="interest" value="Both"/);
  assert.match(h,/href="\/privacy\.html"/);
  assert.match(h,/No stock upload to register/);
  const patch=read('patch_seo.py');
  assert.match(patch,/patch_factory_spares_pilot\(\)/);
  assert.match(patch,/pilot-home\.html/);
  assert.match(patch,/marker = '<section style="padding:2\.8rem 0"/);
  assert.match(read('_blocks/pilot-home.html'),/id="factory-spares-pilot"/);
  assert.match(read('release.py'),/"factory-spares-network\.html": "2026-10-08"/);
});

test('pilot lead validation rejects incomplete, nonconsensual and invalid interest submissions',()=>{
  const p=normaliseRegistration(valid);
  assert.equal(validateRegistration(p),'');
  assert.equal(p.interest,'Find spares');
  assert.match(validateRegistration(normaliseRegistration({...valid,consent:''})),/Consent/);
  assert.match(validateRegistration(normaliseRegistration({...valid,interest:'See other factory stock'})),/interest/);
  assert.match(validateRegistration(normaliseRegistration({...valid,email:'bad'})),/email/);
  assert.match(validateRegistration(normaliseRegistration({...valid,company:''})),/company/);
});

test('API accepts only if at least one lead storage endpoint confirms persistence',async()=>{
  const originalFetch=global.fetch;
  const previous={};
  const config={
    AIRTABLE_ACCESS_TOKEN:'test-key',AIRTABLE_PILOT_BASE_ID:'app60WbULZ9PbuKQv',
    AIRTABLE_PILOT_TABLE_ID:'tblD1vwcqknjkOcxk',FORMSPREE_PILOT_ENDPOINT:'https://formspree.io/f/demo'
  };
  for(const [key,value] of Object.entries(config)){previous[key]=process.env[key];process.env[key]=value;}
  try{
    const calls=[];
    global.fetch=async (url,opts)=>{
      calls.push({url,opts});
      if(url.startsWith('https://api.airtable.com/'))return {ok:true,status:200};
      return {ok:false,status:500};
    };
    const result=await handler(request(valid),response());
    assert.equal(result.status,200);
    assert.equal(result.payload.ok,true);
    assert.equal(calls.length,2);
    const a=calls.find(c=>c.url.startsWith('https://api.airtable.com/'));
    const body=JSON.parse(a.opts.body);
    assert.equal(body.records[0].fields.Company,'Example Engineering Ltd');
    assert.equal(body.records[0].fields.Interest,'Find spares');
    assert.equal(body.records[0].fields.Consent,true);
    assert.equal(body.records[0].fields.Status,'New');

    // No false success when both providers reject the lead.
    global.fetch=async()=>({ok:false,status:500});
    const failed=await handler(request(valid),response());
    assert.equal(failed.status,503);
    assert.equal(failed.payload.ok,false);

    // Malformed and bot submissions cannot persist contact details.
    let fetchCount=0;global.fetch=async()=>{fetchCount++;throw new Error('Should not fetch');};
    const invalid=await handler(request({...valid,consent:''}),response());
    assert.equal(invalid.status,400);
    const bot=await handler(request({...valid,website:'bot-entry'}),response());
    assert.equal(bot.status,200);
    assert.equal(fetchCount,0);
    const crossSite=await handler(request(valid,'https://unrelated.example.com'),response());
    assert.equal(crossSite.status,403);
  }finally{
    global.fetch=originalFetch;
    for(const [key,old] of Object.entries(previous)){if(old===undefined)delete process.env[key];else process.env[key]=old;}
  }
});
