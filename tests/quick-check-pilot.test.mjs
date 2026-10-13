import test from "node:test";
import assert from "node:assert/strict";
import {PILOT_CATALOG,PILOT_METADATA} from "../data/quick-check-pilot-catalog.mjs";
import {pilotMatch,asCacheRecord,pilotSummary} from "../lib/quick-check-pilot.mjs";
import {cacheMatch,reportForLead} from "../lib/quick-check-desk.mjs";

test("100 exact code pilot, no duplicate part numbers or false verified candidates",()=>{
 assert.equal(PILOT_CATALOG.length,100);
 const keys=PILOT_CATALOG.map(r=>r.manufacturer+"|"+r.code.toUpperCase().replace(/\s+/g,""));
 assert.equal(new Set(keys).size,100);
 assert.equal(PILOT_METADATA.goal,100);
 assert.ok(PILOT_CATALOG.every(r=>["Siemens","Allen-Bradley","Mitsubishi"].includes(r.manufacturer)));
 for(const p of PILOT_CATALOG){
  if(!p.source){
    assert.equal(p.lifecycle,"Unknown — check");
    assert.equal(asCacheRecord(p),null);
  }else{
    assert.ok(p.verifiedOn);
    assert.ok(p.source.startsWith("https://"));
    assert.ok(["Active","Mature","Phase-out","Discontinued"].includes(p.lifecycle));
  }
 }
 const p=pilotSummary(new Date("2026-10-13T12:00:00Z"));
 assert.equal(p.total,100);
 assert.equal(p.sourced,85);
 assert.equal(p.current,85);
 assert.equal(p.unknown,15);
 assert.equal(p.byManufacturer.Siemens.current,0);
 assert.equal(p.byManufacturer.Mitsubishi.current,74);
});
test("exact Mitsubishi model retrieves manufacturer source and published suggested successor",()=>{
 const row={code:"FX2N-48MR-ES/UL",manufacturer:"Mitsubishi"};
 const result=cacheMatch(row,[],new Date("2026-10-13T12:00:00Z"));
 assert.equal(result.lifecycle,"Discontinued");
 assert.equal(result.successor,"FX5U-64MR/ES");
 assert.equal(result.availability,"Not checked");
 assert.match(result.source,/mitsubishielectric\.com/);
 assert.equal(cacheMatch({...row,code:"FX2N-48MR-ES/UL-FAKE"},[],new Date("2026-10-13T12:00:00Z")),null);
 assert.equal(cacheMatch({...row,manufacturer:"Siemens"},[],new Date("2026-10-13T12:00:00Z")),null);
});
test("manufacturer snapshot expires: automatically becomes Unknown rather than claiming current lifecycle",()=>{
 const old=new Date("2027-02-01T12:00:00Z");
 const result=cacheMatch({code:"FX2N-48MR-ES/UL",manufacturer:"Mitsubishi"},[],old);
 assert.equal(result,null);
 const l=reportForLead({fields:{
   "Request ID":"AQC-PILOT-1","Name":"Maintenance Manager","Email":"engineer@example.com",
   "Part Numbers":"FX2N-48MR-ES/UL | Mitsubishi | Qty 1","Urgency":"Planning ahead"
 }},[],old);
 assert.equal(l.lines[0].lifecycle,"Unknown — check");
 assert.equal(l.ready,false);
});
test("a published manufacturer record does not imply any AO stock or a drop-in compatible replacement",()=>{
 const report=reportForLead({fields:{
  "Request ID":"AQC-PILOT-2","Name":"Buyer","Email":"buyer@example.com",
  "Part Numbers":"1747-L552 | Allen-Bradley | Qty 2\n6ES7315-2AG10-0AB0 | Siemens | Qty 1",
  "Urgency":"Planning ahead"
 }},[],new Date("2026-10-13T12:00:00Z"));
 assert.equal(report.lines[0].lifecycle,"Discontinued");
 assert.equal(report.lines[0].availability,"Not checked");
 assert.equal(report.lines[1].lifecycle,"Unknown — check");
 assert.equal(report.ready,false);
 assert.doesNotMatch(report.body,/in stock at AO/i);
});
