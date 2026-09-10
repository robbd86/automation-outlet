import test from 'node:test';
import assert from 'node:assert/strict';
import catalogue, {renderCatalogue} from '../api/catalogue.mjs';
import {renderPage} from '../api/product-page.mjs';
import {listProducts} from '../lib/stock-read.mjs';
const part={id:'unit-1',brand:'Siemens',partNumber:'6ES7-TEST',title:'Siemens PLC I/O',category:'PLC I/O module',condition:'Used',priceGbp:15,quantity:1,status:'active',issueState:'open',updatedAt:'2026-09-10',ebayUrl:'https://www.ebay.co.uk/itm/123'};
function schemas(page){return [...page.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));}
test('category HTML includes crawlable active products only, one URL per part',()=>{
 const page=renderCatalogue('siemens',[part,{...part,id:'older',updatedAt:'2025-01-01',priceGbp:9},{...part,partNumber:'DRAFT',status:'draft'},{...part,partNumber:'SOLD',status:'sold'},{...part,partNumber:'CLOSED',issueState:'closed'},{...part,brand:'Omron'}]);
 assert.equal(schemas(page)[0].mainEntity.numberOfItems,1);
 assert.match(page,/href="\/stock\/siemens-6es7-test"/);
 assert.doesNotMatch(page,/DRAFT|SOLD|CLOSED|£9.00/);
 assert.match(page,/£15.00/);
});
test('empty category is noindex and unknown categories return 404',async()=>{
 assert.match(renderCatalogue('drives-inverters',[]),/noindex,follow/);
 let status;const res={setHeader(){},status(s){status=s;return this;},send(){}};
 await catalogue({method:'GET',query:{collection:'constructor'}},res);assert.equal(status,404);
});
test('user-entered product text cannot break HTML or JSON-LD',()=>{
 const page=renderCatalogue('all',[{...part,title:'</script><script>alert(1)</script>'}]);
 assert.doesNotMatch(page,/<script>alert\(1\)/);assert.equal(schemas(page)[0].mainEntity.numberOfItems,1);
});
test('product price and condition schema agree with displayed data',()=>{
 const page=renderPage({...part,condition:'For parts or repair'});
 assert.equal(schemas(page)[0].offers.itemCondition,'https://schema.org/DamagedCondition');
 const unknown=renderPage({...part,priceGbp:null});assert.match(unknown,/Enquire for price/);assert.equal(schemas(unknown)[0].offers,undefined);
 assert.match(page,/id="navToggle"/);assert.match(page,/id="mobileMenu"/);assert.match(page,/final checkout total/);
});
test('stock reader paginates and catalogue failures remain 503',async()=>{
 const original=global.fetch;const token=process.env.AO_GITHUB_TOKEN;process.env.AO_GITHUB_TOKEN='test-only';let calls=0;
 const issue={state:'open',body:'<!-- AO_STOCK_B64:'+Buffer.from(JSON.stringify(part)).toString('base64')+' -->'};
 try{
  global.fetch=async()=>({ok:true,json:async()=>++calls===1?Array(100).fill(issue):[issue]});
  assert.equal((await listProducts()).length,101);assert.equal(calls,2);
  global.fetch=async()=>({ok:false,status:503,json:async()=>({message:'temporarily unavailable'})});
  let status;const res={setHeader(){},status(s){status=s;return this;},send(){}};
  await catalogue({method:'GET',query:{collection:'all'}},res);assert.equal(status,503);
 }finally{global.fetch=original;if(token===undefined)delete process.env.AO_GITHUB_TOKEN;else process.env.AO_GITHUB_TOKEN=token;}
});
