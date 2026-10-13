// A signed, self-serve opt-out for AO Quick Check marketing.
// No marketing is automated by this feature; links exist for any later consented emails.
import {createHmac,timingSafeEqual} from "node:crypto";
const clean=(v,n=200)=>String(v??"").replace(/\0/g,"").trim().slice(0,n);
const ok=(res,status,body)=>{res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("X-Robots-Tag","noindex, nofollow");return res.status(status).json(body);};
const secret=()=>process.env.AO_DEAL_DESK_KEY||"";
export function signature(id){
 if(!/^rec[A-Za-z0-9]{14}$/.test(id)||!secret())return "";
 return createHmac("sha256",secret()).update("AO-QC-UNSUB-v1:"+id).digest("hex");
}
export function unsubLink(id){
 const sig=signature(id);
 return sig?"https://www.automation-outlet.co.uk/quick-check-unsubscribe.html?ref="+encodeURIComponent(id)+"&token="+sig:"";
}
export function validSignature(id,token){
 const expected=signature(id),got=clean(token,200);
 const a=Buffer.from(expected),b=Buffer.from(got);
 return a.length===64&&b.length===64&&timingSafeEqual(a,b);
}
export default async function handler(req,res){
 res.setHeader("Allow","POST, OPTIONS");
 if(req.method==="OPTIONS")return res.status(204).end();
 if(req.method!=="POST")return ok(res,405,{ok:false,error:"Method not allowed"});
 let body;try{body=typeof req.body==="string"?JSON.parse(req.body):req.body;}catch{return ok(res,400,{ok:false,error:"Invalid request"});}
 const id=clean(body?.ref,60),token=clean(body?.token,150);
 if(!validSignature(id,token))return ok(res,400,{ok:false,error:"Invalid or outdated unsubscribe link. Email info@automation-outlet.co.uk and we'll help."});
 const apiToken=process.env.AIRTABLE_ACCESS_TOKEN,base=process.env.AO_QUICK_CHECK_BASE_ID,table=process.env.AO_QUICK_CHECK_TABLE_ID;
 if(!apiToken||!base||!table)return ok(res,503,{ok:false,error:"Unsubscribe is not configured yet. Please email info@automation-outlet.co.uk."});
 try{
  const response=await fetch("https://api.airtable.com/v0/"+encodeURIComponent(base)+"/"+encodeURIComponent(table),{
   method:"PATCH",headers:{Authorization:"Bearer "+apiToken,"Content-Type":"application/json"},
   body:JSON.stringify({records:[{id,fields:{"Marketing Consent":false}}]}),
   signal:AbortSignal.timeout(6500)
  });
  if(!response.ok)throw Error("Airtable unsubscribe error "+response.status);
  return ok(res,200,{ok:true,message:"You've been removed from AO Quick Check marketing updates. Your original enquiry may still be retained as described in our privacy notice."});
 }catch(e){
  console.error("AO unsubscribe:",e.message);
  return ok(res,503,{ok:false,error:"Could not update your preference. Email info@automation-outlet.co.uk for help."});
 }
}
