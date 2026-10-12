import test from "node:test";
import assert from "node:assert/strict";
import {classifyCondition, normaliseMpn, normaliseOffers, supplierSearchHandler} from "../lib/supplier-search.mjs";

test("normalises typography without merging different manufacturer part numbers",()=>{
  assert.equal(normaliseMpn(" 6ES7315–2AG10–0AB0 "), "6ES7315-2AG10-0AB0");
  assert.notEqual(normaliseMpn("1756171"),normaliseMpn("1756-L71"));
});
test("classifies common conditions conservatively",()=>{
  assert.equal(classifyCondition("New Factory Sealed"),"New");
  assert.equal(classifyCondition("Refurbished"),"Refurbished");
  assert.equal(classifyCondition("Used Tested"),"Used");
  assert.equal(classifyCondition("Defect"),"Other");
});
test("only exact MPN with positive supplier quantity appears in offers",()=>{
  const payload={data:{items:[
    {id:"1",mpn:"1756171",brand:"PHOENIX CONTACT",quantity:5,pricing:{amount:99,currency:"GBP"}},
    {id:"2",mpn:"1756-L71",brand:"ALLEN BRADLEY",quantity:46,condition:"New surplus",pricing:{amount:240,currency:"EUR"},company:{name:"Supplier A",country:"DE"}},
    {id:"3",mpn:"1756-L71",quantity:0,condition:"Used",pricing:{amount:100,currency:"GBP"}},
    {id:"4",mpn:"1756-L71",quantity:2,condition:"Used",pricing:{amount:null,currency:"GBP"},company:{name:"Supplier B",country:"GB"}}
  ]}};
  const result=normaliseOffers(payload,"1756-L71");
  assert.equal(result.summary.returned,4);
  assert.equal(result.summary.exactOffers,3);
  assert.equal(result.summary.availableOffers,2);
  assert.equal(result.summary.suppliers,2);
  assert.equal(result.summary.offersWithPrice,1);
  assert.equal(result.offers[0].unitPrice,240);
  assert.equal(result.offers[0].currency,"EUR");
  assert.equal(result.offers[1].unitPrice,null);
});
test("restricts supplier data endpoint to preview and authorized admin users",async()=>{
  const original=process.env.VERCEL_ENV;
  const keyOriginal=process.env.AO_DEAL_DESK_KEY;
  const makeRes=()=>{
    const r={statusCode:0,headers:{},payload:null};
    r.setHeader=(k,v)=>r.headers[k]=v;
    r.status=n=>(r.statusCode=n,r);
    r.json=obj=>(r.payload=obj,r);
    return r;
  };
  try {
    process.env.VERCEL_ENV="production";
    process.env.AO_DEAL_DESK_KEY="test-secret";
    const deniedProd=makeRes();
    await supplierSearchHandler({method:"GET",headers:{"x-deal-desk-key":"test-secret"},query:{check:"1"}},deniedProd);
    assert.equal(deniedProd.statusCode,404);
    process.env.VERCEL_ENV="preview";
    const denied=makeRes();
    await supplierSearchHandler({method:"GET",headers:{},query:{check:"1"}},denied);
    assert.equal(denied.statusCode,401);
    const accepted=makeRes();
    await supplierSearchHandler({method:"GET",headers:{"x-deal-desk-key":"test-secret"},query:{check:"1"}},accepted);
    assert.equal(accepted.statusCode,200);
    assert.equal(accepted.payload.ok,true);
  } finally {
    if(original===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=original;
    if(keyOriginal===undefined)delete process.env.AO_DEAL_DESK_KEY;else process.env.AO_DEAL_DESK_KEY=keyOriginal;
  }
});
