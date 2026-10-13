// On-demand manufacturer evidence retrieval. Private review only.
// Do not auto-approve lifecycle or replacements: vendor HTML can change without notice.
const ENTRIES=["Active Mature","End of Life","Discontinued","Active"];
export function parseRockwellEvidence(raw,exactCode){
 const target=String(exactCode||"").trim().toUpperCase();
 if(!/^[A-Z0-9-]{5,40}$/.test(target))return null;
 if(typeof raw!=="string"||raw.length>2500000)return null;
 const text=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi," ")
  .replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ")
  .replace(/\s+/g," ").trim();
 const id=text.match(/Unique Product Identifier\s*:?\s*([A-Z0-9-]+)/i);
 if(!id||id[1].toUpperCase()!==target)return null;
 const match=text.match(/Lifecycle status\s*:\s*(Active Mature|End of Life|Discontinued|Active)\b/i);
 if(!match)return null;
 const lifecycle=match[1].toLowerCase()==="active mature"?"Mature":
 match[1].toLowerCase()==="end of life"?"Phase-out":
 match[1].toLowerCase()==="discontinued"?"Discontinued":"Active";
 const dt=text.match(/Discontinued Date\s*:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
 const successor=text.match(/Replacement Product\s*:\s*([A-Z0-9-]+)/i);
 return {code:target,lifecycle,reportedStatus:match[1],discontinuedDate:dt?.[1]||"",
    suggestedSuccessor:successor?.[1]||""};
}
export async function researchRockwell(code){
 const part=String(code||"").trim().toUpperCase();
 if(!/^[A-Z0-9-]{5,40}$/.test(part))throw Object.assign(new Error("Invalid exact Rockwell order code"),{status:400});
 const url="https://www.rockwellautomation.com/en-us/products/details."+encodeURIComponent(part.toLowerCase())+".html";
 try{
  const response=await fetch(url,{headers:{"Accept":"text/html","User-Agent":"AutomationOutletQuickCheck/1.0 (product research)"},signal:AbortSignal.timeout(7000),redirect:"error"});
  if(!response.ok)return {status:"not-confirmed",code:part,url,message:"Official product page not accessible. Research manually."};
  const header=Number(response.headers.get("content-length")||0);
  if(header>2500000)return {status:"not-confirmed",code:part,url,message:"Official page exceeds safe size limit."};
  const html=await response.text();
  const parsed=parseRockwellEvidence(html,part);
  if(!parsed)return {status:"not-confirmed",code:part,url,message:"Exact manufacturer ID and lifecycle status could not both be independently parsed. Review manually."};
  return {status:"suggested",url,checkedAt:new Date().toISOString(),...parsed,
     message:"Research suggestion only — open official source and verify exact revision/status before saving to the cache."};
 }catch{
  return {status:"not-confirmed",code:part,url,message:"Official page could not be retrieved. No lifecycle status inferred."};
 }
}
