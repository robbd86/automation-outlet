import {PILOT_CATALOG,PILOT_METADATA} from "../data/quick-check-pilot-catalog.mjs";
export const canonicalPart=(value)=>String(value??"").toUpperCase().replace(/\s+/g,"").trim();
export function pilotMatch(code,manufacturer="Not sure"){
 return PILOT_CATALOG.find(x=>canonicalPart(x.code)===canonicalPart(code)&&
 (manufacturer==="Not sure"||manufacturer==="Other"||x.manufacturer===manufacturer))||null;
}
export function asCacheRecord(part){
 if(!part?.source||!part.verifiedOn)return null;
 return {origin:"manufacturer-snapshot",fields:{
   "Part Number":part.code,"Manufacturer":part.manufacturer,
   "Lifecycle":part.lifecycle,"Successor":part.successor||"",
   "Manufacturer Source":part.source,"Last Verified":part.verifiedOn,
   "Availability":"Not checked",
   "Notes":"Official manufacturer snapshot ("+part.region+"), last reviewed "+part.verifiedOn+
    ". Verify local market and exact revision; a suggested replacement is not necessarily drop-in."}};
}
export function pilotSummary(now=new Date()){
 const results={total:PILOT_CATALOG.length,sourced:0,current:0,unknown:0,
   checkedOn:PILOT_METADATA.asOf,byManufacturer:{}};
 for(const p of PILOT_CATALOG){
   const m=results.byManufacturer[p.manufacturer] ||= {total:0,sourced:0,current:0,unknown:0};
   m.total++;
   if(!p.source){m.unknown++;results.unknown++;continue;}
   m.sourced++;results.sourced++;
   const age=Date.parse(p.verifiedOn);
   if(Number.isFinite(age)&&age<=now.getTime()&&now.getTime()-age<=90*86400000){results.current++;m.current++;}
 }
 return results;
}
export function pilotParts(){return PILOT_CATALOG;}
