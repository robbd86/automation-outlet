export const categories=['PLC / CPU','HMI','Drives','Safety','I/O modules','Sensors','Other'];
export const conditions=['New sealed','New boxed','New surplus','Refurbished','Used tested','Used untested','Spares or repair'];
export const vatOptions=['Not applicable','VAT included','VAT excluded'];
export const deliveries=['Courier or collection','Courier only','Collection only'];
export function validateListing(input){
 const out={};
 for(const [key,max] of Object.entries({manufacturer:80,part_number:100,title:140,description:2000,region:100})){
  const v=String(input[key]??'').trim();
  if(!v||v.length>max)throw Error('Check '+key.replaceAll('_',' '));
  out[key]=v;
 }
 if(!/[a-z0-9]/i.test(out.part_number))throw Error('Enter a valid part number');
 for(const [key,options] of Object.entries({category:categories,condition:conditions,vat_treatment:vatOptions,delivery:deliveries})){
  if(!options.includes(input[key]))throw Error('Choose '+key.replaceAll('_',' '));out[key]=input[key];
 }
 const price=String(input.price??'').trim();
 if(!/^\d{1,7}(\.\d{1,2})?$/.test(price))throw Error('Enter a valid asking price in GBP');
 const [p,f='']=price.split('.');out.price_pence=Number(p)*100+Number(f.padEnd(2,'0'));
 if(out.price_pence<1||out.price_pence>100000000)throw Error('Asking price must be £0.01 to £1,000,000');
 const qty=String(input.quantity??'');if(!/^\d{1,5}$/.test(qty)||Number(qty)<1||Number(qty)>10000)throw Error('Quantity must be 1–10,000');
 out.quantity=Number(qty);return out;
}
const cols='id,manufacturer,part_number,title,category,condition,description,price_pence,quantity,vat_treatment,delivery,region,status,created_at,updated_at';
export function createListingClient(client,auth){
 const db=client.schema('marketplace');
 const user=()=>auth.verifiedUser();
 function check(r){if(r.error)throw Error('Listing operation failed. Check your details or try again.');return r.data}
 return {
 async own(){const u=await user();return check(await db.from('listings').select(cols).eq('seller_id',u.id).order('created_at',{ascending:false}).limit(200))},
 async create(input){const u=await user();return check(await db.from('listings').insert({...validateListing(input),seller_id:u.id}).select(cols).single())},
 async edit(id,input){const u=await user();return check(await db.from('listings').update({...validateListing(input),status:'draft'}).eq('id',id).eq('seller_id',u.id).in('status',['draft','rejected','withdrawn']).select(cols).single())},
 async submit(id){const u=await user();return check(await db.from('listings').update({status:'pending'}).eq('id',id).eq('seller_id',u.id).eq('status','draft').select(cols).single())},
 async withdrawDraft(id){const u=await user();return check(await db.from('listings').update({status:'withdrawn'}).eq('id',id).eq('seller_id',u.id).in('status',['draft','rejected']).select(cols).single())},
 async browse(){return check(await db.from('listings').select(cols).eq('status','published').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(200))}
 };
}
