import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function calculator(fields={}) {
  let code=readFileSync(new URL("../supplier-search.js",import.meta.url),"utf8");
  const init=code.indexOf('byId("loginForm").addEventListener');
  assert.ok(init>0);
  code=code.slice(0,init);
  code+='\n globalThis.__calc={state,rate,gbpCost,landedDetails,profit,rankedOffers,region};';
  const values={
    resaleGbp:"450",additionalGbp:"10",feesPct:"10",
    shipUk:"15",shipEu:"35",shipOther:"65",importAllowancePct:"20",
    ...fields,
  };
  const context={
    document:{getElementById:id=>({value:values[id]??"",classList:{toggle(){}},textContent:""})},
    Intl, Date, URLSearchParams, navigator:{}, sessionStorage:{},
  };
  vm.runInNewContext(code,context,{timeout:1500});
  context.__calc.state.data={
    fx:{status:"available",date:"2026-10-09",rates:{GBP:1,EUR:.85,USD:.75}},
  };
  return context.__calc;
}

test("automatically converts EUR and calculates UK landed cost including import provision",()=>{
  const calc=calculator();
  const item={
    currency:"EUR",unitPrice:200,supplierCountry:"Germany",
    conditionGroup:"New",quantity:5,updatedAt:new Date().toISOString(),status:"In-stock",
  };
  assert.equal(calc.gbpCost(item),170);
  const landed=calc.landedDetails(item);
  assert.equal(landed.shipping,35);
  assert.equal(landed.tax,41);
  assert.equal(landed.extra,10);
  assert.equal(landed.total,256);
  assert.equal(calc.profit(item).gross,149);
});
test("domestic shipping is added without speculative import tax",()=>{
  const c=calculator();
  const item={currency:"GBP",unitPrice:270,supplierCountry:"United Kingdom"};
  const costs=c.landedDetails(item);
  assert.equal(costs.total,295); // 270 + 15 freight + 10 handling
  assert.equal(costs.tax,0);
});
test("unknown FX currencies cannot be ranked or converted as if they were GBP",()=>{
  const c=calculator();
  const item={currency:"ZAR",unitPrice:200,supplierCountry:"South Africa"};
  assert.equal(c.gbpCost(item),null);
  assert.equal(c.landedDetails(item),null);
  assert.equal(c.rankedOffers([item]).length,0);
});
test("best opportunity ranking favours landed cost and healthy margin over raw supplier quote",()=>{
  const c=calculator();
  const data=[
    {id:"EU1",supplier:"New supplier",mpn:"1756-L71",currency:"EUR",unitPrice:200,supplierCountry:"Germany",conditionGroup:"New",quantity:5,updatedAt:new Date().toISOString(),status:"In-stock"},
    {id:"UK1",supplier:"UK supplier",mpn:"1756-L71",currency:"GBP",unitPrice:270,supplierCountry:"United Kingdom",conditionGroup:"Used",quantity:2,updatedAt:new Date().toISOString(),status:"In-stock"},
  ];
  const ranked=c.rankedOffers(data);
  assert.equal(ranked.length,2);
  assert.equal(ranked[0].id,"EU1");
  assert.ok(ranked[0].score>ranked[1].score);
});
