import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const slugs=["powerflex-40-f005-overvoltage","powerflex-525-f004-undervoltage","powerflex-525-f005-overvoltage","siemens-s7-300-sf-led","siemens-s7-300-bf-bus-fault","panelview-plus-blank-screen","slc-500-battery-low"];

test("all seven guides have human-readable, indexable, distinct content and official reference links",()=>{
  const titles=new Set();
  for(const slug of slugs){
    const page="fault-"+slug+".html",html=read(page);
    assert.match(html,/<html lang="en-GB">/);
    assert.ok(html.includes('<link rel="canonical" href="https://www.automation-outlet.co.uk/'+page+'">'),page);
    assert.doesNotMatch(html,/<meta name="robots" content="noindex/i);
    const title=html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title&&title.length>32,page+" title");
    assert.ok(!titles.has(title),page+" duplicate title");titles.add(title);
    assert.match(html,/<h1\b/);
    assert.match(html,/Step-by-step diagnostic checklist/);
    assert.match(html,/Help narrow it down/);
    assert.match(html,/Read the official manual/);
    assert.match(html,/Print \/ Save checklist/);
    const json=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
    assert.ok(json,page+" structured data");
    const schema=JSON.parse(json);assert.equal(schema["@type"],"TechArticle");
    assert.ok(schema.isBasedOn.startsWith("https://"),page+" source");
  }
});

test("searchable fault hub links every guide and performs real client-side filtering",()=>{
 const hub=read("fault-finder.html"),js=read("fault-finder.js"),css=read("fault-finder.css");
 for(const slug of slugs) assert.ok(hub.includes("/fault-"+slug+".html"),slug);
 for(const key of ['id="faultSearch"','id="faultCards"','id="noResults"','data-filter="PLCs"','data-filter="Drives"','data-filter="HMIs"']) assert.ok(hub.includes(key),key);
 assert.match(js,/searchParams\.get\("q"\)/);
 assert.match(js,/card\.classList\.toggle/);
 assert.match(js,/data\.category|dataset\.category/);
 assert.match(css,/@media\(max-width:560px\)/);
 const schema=JSON.parse(hub.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);assert.equal(schema["@type"],"CollectionPage");
});

test("post-build site links to Fault Finder and sitemap includes all public guides",()=>{
 assert.match(read("index.html"),/id="ao-fault-finder-home"/);
 assert.match(read("engineering-toolbox.html"),/id="ao-fault-finder-toolbox"/);
 const sitemap=read("sitemap.xml");
 for(const path of ["fault-finder.html",...slugs.map(s=>"fault-"+s+".html")]) assert.ok(sitemap.includes("https://www.automation-outlet.co.uk/"+path),path);
 assert.match(read("release.py"),/FAULT_FINDER_HOME/);
});

const extraSlugs=["powerflex-525-f002-auxiliary-input","powerflex-525-f003-power-loss","powerflex-525-f006-motor-stalled","powerflex-525-f007-motor-overload","powerflex-525-f008-heatsink-overtemperature","powerflex-525-f009-control-module-overtemperature","powerflex-525-f012-hardware-overcurrent","powerflex-525-f013-ground-fault","powerflex-525-f015-load-loss","powerflex-525-f021-output-phase-loss","powerflex-525-f029-analog-input-loss","powerflex-40-f3-excessive-dc-bus-ripple","powerflex-40-f4-undervoltage","powerflex-40-f6-motor-stalled","powerflex-40-f7-motor-overload","powerflex-40-f8-heatsink-overtemperature","powerflex-40-f12-hardware-overcurrent","powerflex-40-f13-ground-fault","powerflex-40-f29-analog-input-loss"];
test("expanded guides have distinct pages and work with the model-aware fault search",()=>{
 const hub=read("fault-finder.html"),js=read("fault-finder.js");
 for(const slug of extraSlugs){const p="fault-"+slug+".html",html=read(p);
 assert.ok(hub.includes("/"+p),p);assert.match(html,/<h1\b/);
 assert.match(html,/Diagnostic checklist/);assert.match(html,/Official Rockwell documentation/);
 assert.ok(html.includes('rel="canonical" href="https://www.automation-outlet.co.uk/'+p+'"'));
 assert.doesNotMatch(html,/<meta name="robots" content="noindex/i);
 assert.ok(read("sitemap.xml").includes("/"+p));
 }
 assert.ok(hub.includes('id="familyFilter"'));
 assert.ok(hub.includes("PowerFlex 525 F008"));
 assert.ok(hub.includes("PowerFlex 40 F8"));
 assert.match(js,/function normalise/);
 assert.match(js,/missingAdvice/);
});

test("F010 disambiguation page uses model-specific Rockwell source evidence",()=>{
 const url="fault-powerflex-f010-f10-model-identification.html",p=read(url),hub=read("fault-finder.html"),sitemap=read("sitemap.xml");
 assert.ok(hub.includes('href="/'+url+'"'));
 assert.ok(sitemap.includes("/"+url));
 assert.match(p,/PowerFlex 40/);
 assert.match(p,/PowerFlex 525/);
 assert.match(p,/PowerFlex Digital DC/);
 assert.match(p,/Main Contactor/);
 assert.match(p,/not in the published fault table/i);
 assert.match(p,/22b-um001_-en-e\.pdf/);
 assert.match(p,/520-du001_-en-e\.pdf/);
 assert.match(p,/20p-tg004_-en-p\.pdf/);
 assert.match(p,/<link rel="canonical"/);
 assert.doesNotMatch(p,/meta name="robots" content="noindex/i);
});
