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
