import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const hub=readFileSync("fault-finder.html","utf8");
const script=readFileSync("fault-finder.js","utf8");
const strip=s=>s.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();

function render(query, model="All") {
 const cards=[...hub.matchAll(/<article class="ff-card"([^>]*)>([\s\S]*?)<\/article>/g)].map(x=>{
  const attr=x[1],hidden=new Set(),listeners={};
  return {dataset:{
    category:attr.match(/data-category="([^"]+)"/)?.[1]||"",
    family:attr.match(/data-family="([^"]+)"/)?.[1]||"",
    keywords:attr.match(/data-keywords="([^"]+)"/)?.[1]||""
   },textContent:strip(x[2]),classList:{
     toggle(name,on){if(on)hidden.add(name);else hidden.delete(name)},
     contains(name){return hidden.has(name)}
   },setAttribute(){},addEventListener(event,fn){listeners[event]=fn}};
 });
 function element(value=""){const hidden=new Set(),listeners={};
  return {value,textContent:"",dataset:{filter:"All"},hidden:false,
    listeners,classList:{toggle(name,on){if(on)hidden.add(name);else hidden.delete(name)},contains(name){return hidden.has(name)}},
    addEventListener(event,fn){listeners[event]=fn},setAttribute(){},
    scrollIntoView(){}};
 }
 const input=element(),family=element(model),counter=element(),empty=element(),advice=element(),sources=element(),form=element();
 const chips=["All","Drives","PLCs","HMIs"].map(name=>{const e=element();e.dataset.filter=name;return e});
 const ids={faultSearch:input,familyFilter:family,count:counter,noResults:empty,missingAdvice:advice,missingSources:sources,searchForm:form,faultCards:element()};
 const document={getElementById(id){return ids[id]||null},querySelectorAll(selector){
   if(selector==="#faultCards .ff-card")return cards;
   if(selector===".ff-chip")return chips;
   return [];
 }};
 const location={href:"https://www.automation-outlet.co.uk/fault-finder.html?q="+encodeURIComponent(query)};
 vm.runInNewContext(script,{document,location,URL,history:{replaceState(){}},String,Number,console});
 return {count:Number(counter.textContent.replace(/\D/g,"")),shown:cards.filter(x=>!x.classList.contains("ff-hide")).map(x=>x.textContent),
   noResults:!empty.classList.contains("ff-hide"),advice:advice.textContent,
   setModel(value){family.value=value;family.listeners.change();return cards.filter(x=>!x.classList.contains("ff-hide")).length}};
}
test("F008 and F8 resolve to both model-specific PowerFlex heatsink guides",()=>{
 for(const query of ["Powerflex f008","PowerFlex F8","power-flex F 008"]){
  const result=render(query);
  assert.equal(result.count,2,query+" => "+result.shown.join(" / "));
  assert.ok(result.shown.some(x=>x.includes("PowerFlex 40")));
  assert.ok(result.shown.some(x=>x.includes("PowerFlex 525")));
 }
});
test("other codes are model-specific rather than assumed interchangeable",()=>{
 const a=render("Powerflex 525 F003");
 assert.equal(a.count,1);
 assert.match(a.shown[0],/Power Loss/);
 const b=render("Powerflex 40 F3");
 assert.equal(b.count,1);
 assert.match(b.shown[0],/DC Bus Ripple/);
 assert.equal(render("PowerFlex F005").count,2);
});
test("model selector narrows results and unknown faults offer meaningful fallback",()=>{
 const a=render("Powerflex F008");
 assert.equal(a.setModel("PowerFlex 40"),1);
 const b=render("Powerflex F500");
 assert.equal(b.count,0);
 assert.equal(b.noResults,true);
 assert.match(b.advice,/manufacturer|PowerFlex|fault/i);
});

test("F010 and F10 queries identify the model-dependent guide, including PowerFlex family filters",()=>{
 for(const q of ["PowerFlex F010","PowerFlex F10","PowerFlex 525 F010","power-flex f 010"]){
  const r=render(q);
  assert.equal(r.count,1,q+" => "+r.shown.join(" / "));
  assert.match(r.shown[0],/model/i);
  if(q==="PowerFlex F010") assert.equal(r.setModel("PowerFlex 525"),1);
 }
});
