import {timingSafeEqual} from "node:crypto";
import {fetchDesk,verifyPart,updateLead} from "./quick-check-desk.mjs";
const json=(res,status,body)=>{res.setHeader("Cache-Control","no-store");res.setHeader("X-Robots-Tag","noindex, nofollow");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Content-Type","application/json; charset=utf-8");return res.status(status).json(body);};
export function adminAllowed(req){
 const secret=process.env.AO_DEAL_DESK_KEY||"",received=String(req.headers?.["x-deal-desk-key"]||"");
 const expected=Buffer.from(secret,"utf8"),provided=Buffer.from(received,"utf8");
 return expected.length>0&&expected.length===provided.length&&timingSafeEqual(expected,provided);
}
export default async function quickCheckAdmin(req,res){
 res.setHeader("Allow","GET, POST, OPTIONS");
 if(req.method==="OPTIONS")return res.status(204).end();
 if(!adminAllowed(req))return json(res,401,{ok:false,error:"Admin access denied"});
 if(!["GET","POST"].includes(req.method))return json(res,405,{ok:false,error:"Method not allowed"});
 try{
  if(req.method==="GET")return json(res,200,{ok:true,...await fetchDesk()});
  if(Number(req.headers?.["content-length"]||0)>25000)return json(res,413,{ok:false,error:"Payload too large"});
  const raw=typeof req.body==="string"?JSON.parse(req.body):req.body;
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return json(res,400,{ok:false,error:"Invalid request body"});
  if(raw.action==="verifyPart")return json(res,200,await verifyPart(raw));
  if(raw.action==="updateLead")return json(res,200,await updateLead(raw));
  return json(res,400,{ok:false,error:"Unknown action"});
 }catch(e){
  console.error("AO Quick Check desk:",e?.message||"unknown");
  return json(res,e?.status>=400&&e?.status<500?e.status:503,{
   ok:false,error:e?.status===409||e?.status===400||e?.status===404?e.message:"Could not complete this operation. Check Airtable configuration."
  });
 }
}
