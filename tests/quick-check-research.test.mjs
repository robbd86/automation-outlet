import test from "node:test";
import assert from "node:assert/strict";
import {parseRockwellEvidence,researchRockwell} from "../lib/quick-check-research.mjs";
test("exact Rockwell part ID and explicit lifecycle status are mandatory",()=>{
 const html="<html><h1>1747-L542</h1><p>Lifecycle status: Discontinued</p><table><tr><td>Unique Product Identifier</td><td>1747-L542</td></tr></table><p>Discontinued Date: March 31, 2024</p></html>";
 const v=parseRockwellEvidence(html,"1747-L542");
 assert.equal(v?.code,"1747-L542");assert.equal(v?.lifecycle,"Discontinued");
 assert.equal(v?.discontinuedDate,"March 31, 2024");
 assert.equal(parseRockwellEvidence(html,"1747-L553"),null);
 assert.equal(parseRockwellEvidence(html.replace("Lifecycle status: Discontinued","Lifecycle status: In stock from dealer"),"1747-L542"),null);
 assert.equal(parseRockwellEvidence("<p>Lifecycle status: Active</p>","1747-L542"),null);
});
test("parser distinguishes mature and end of life from fully active status",()=>{
 const body=(status)=>"<h1>1756-L71</h1><p>Lifecycle status: "+status+"</p><table><tr><td>Unique Product Identifier</td><td>1756-L71</td></tr></table>";
 assert.equal(parseRockwellEvidence(body("Active Mature"),"1756-L71")?.lifecycle,"Mature");
 assert.equal(parseRockwellEvidence(body("End of Life"),"1756-L71")?.lifecycle,"Phase-out");
 assert.equal(parseRockwellEvidence(body("Active"),"1756-L71")?.lifecycle,"Active");
});
test("source lookup cannot fetch any arbitrary URL and only returns research suggestions",async()=>{
 const saved=globalThis.fetch;
 let path="";
 globalThis.fetch=async(url)=>{
  path=url;
  return {ok:true,status:200,headers:new Headers(),text:async()=>"<h1>1747-L542</h1><p>Lifecycle status: Discontinued</p><table><tr><td>Unique Product Identifier</td><td>1747-L542</td></tr></table>"};
 };
 try{
  const x=await researchRockwell("1747-L542");
  assert.equal(x.status,"suggested");
  assert.equal(x.lifecycle,"Discontinued");
  assert.match(x.message,/review/i);
  assert.equal(path,"https://www.rockwellautomation.com/en-us/products/details.1747-l542.html");
  await assert.rejects(()=>researchRockwell("https://other.test/"),/Invalid exact Rockwell/);
 }finally{globalThis.fetch=saved;}
});
