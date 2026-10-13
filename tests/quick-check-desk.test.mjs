import test from "node:test";
import assert from "node:assert/strict";
import {sourceAllowed,cacheMatch,reportForLead,riskHint,partRows} from "../lib/quick-check-desk.mjs";
import {adminAllowed} from "../lib/quick-check-admin.mjs";

const lead={fields:{"Request ID":"AQC-TEST123","Name":"Example Manager","Email":"sample@example.com",
 "Part Numbers":"1747-L542 | Allen-Bradley | Qty 1\nFX2N-48MR-ES/UL | Mitsubishi | Qty 2",
 "Urgency":"Planning ahead"}};
const current=new Date("2026-10-13T12:00:00Z");
const known={fields:{
 "Part Number":"1747-L542","Manufacturer":"Allen-Bradley","Lifecycle":"Discontinued",
 "Last Verified":"2026-10-13T11:00:00Z","Manufacturer Source":"https://www.rockwellautomation.com/en-us/products/details.1747-L542.html",
 "Availability":"Not checked","Successor":"","Notes":"Manufacturer product page reviewed"}};
const mitsu={fields:{
 "Part Number":"FX2N-48MR-ES/UL","Manufacturer":"Mitsubishi","Lifecycle":"Discontinued",
 "Last Verified":"2026-10-13T11:00:00Z","Manufacturer Source":"https://us.mitsubishielectric.com/fa/en/support/parts/legacy-products/programmable-controllers/fx2n-fx2nc",
 "Availability":"Not checked","Successor":"FX5U-64MR/ES","Notes":"Suggested replacement, not drop-in"}};
test("official URLs only: no lookalikes, redirects or plain HTTP",()=>{
 assert.equal(sourceAllowed("Allen-Bradley",known.fields["Manufacturer Source"]),true);
 assert.equal(sourceAllowed("Mitsubishi",mitsu.fields["Manufacturer Source"]),true);
 assert.equal(sourceAllowed("Omron","https://industrial.omron.co.uk/en/products/CJ2M-CPU31"),true);
 assert.equal(sourceAllowed("Siemens","https://support.industry.siemens.com/cs/product"),true);
 assert.equal(sourceAllowed("Siemens","https://siemens.com.attacker.org/cs/product"),false);
 assert.equal(sourceAllowed("Siemens","http://siemens.com/cs/product"),false);
 assert.equal(sourceAllowed("Allen-Bradley","https://rockwellautomation.com@attacker.test/"),false);
});
test("only fresh, exact, manufacturer-matching verified cache entries count",()=>{
 const [row]=partRows("1747-L542 | Allen-Bradley | Qty 1");
 assert.equal(cacheMatch(row,[known],current)?.lifecycle,"Discontinued");
 assert.equal(cacheMatch({...row,code:"1747-L543"},[known],current),null);
 assert.equal(cacheMatch({...row,manufacturer:"Omron"},[known],current),null);
 const stale={fields:{...known.fields,"Last Verified":"2026-01-01T00:00:00Z"}};
 assert.equal(cacheMatch(row,[stale],current),null);
 const bogus={fields:{...known.fields,"Manufacturer Source":"https://bad.com"}};
 assert.equal(cacheMatch(row,[bogus],current),null);
});
test("report defaults to Unknown — check and only becomes ready on full verified coverage",()=>{
 const a=reportForLead(lead,[],current);
 assert.equal(a.ready,false);assert.equal(a.pendingCount,2);
 assert.equal(a.lines[0].lifecycle,"Unknown — check");
 assert.equal(a.lines[0].risk,"Unknown");
 assert.equal(a.lines[0].availability,"Not checked");
 const b=reportForLead(lead,[known,mitsu],current);
 assert.equal(b.ready,true);assert.equal(b.verifiedCount,2);
 assert.equal(b.lines[1].successor,"FX5U-64MR/ES");
 assert.equal(b.lines[0].risk,"Medium");
 assert.match(b.body,/not an on-site inspection/i);
});
test("stock listing does not automatically become available in a customer report",()=>{
 const x={fields:{...known.fields,"Availability":"Listed"}};
 const out=cacheMatch({code:"1747-L542",manufacturer:"Allen-Bradley"},[x],current);
 assert.equal(out.availability,"Not checked");
});
test("risk is preliminary supply risk, not production risk",()=>{
 assert.equal(riskHint("Discontinued","Not currently","Planning ahead"),"High");
 assert.equal(riskHint("Active","Not checked","Planning ahead"),"Low (lifecycle only)");
 assert.equal(riskHint(null,"Not checked","Planning ahead"),"Unknown");
});
test("admin endpoint requires server-side private key",()=>{
 const old=process.env.AO_DEAL_DESK_KEY;
 try{
  process.env.AO_DEAL_DESK_KEY="test-secret";
  assert.equal(adminAllowed({headers:{"x-deal-desk-key":"wrong"}}),false);
  assert.equal(adminAllowed({headers:{"x-deal-desk-key":"test-secret"}}),true);
  assert.equal(adminAllowed({headers:{"x-deal-desk-key":""}}),false);
 }finally{if(old===undefined)delete process.env.AO_DEAL_DESK_KEY;else process.env.AO_DEAL_DESK_KEY=old;}
});
