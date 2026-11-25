import {createMarketplaceAuth} from './auth-client.mjs';
const $=id=>document.getElementById(id);
const say=s=>{$('status').textContent=s};
const forms=['login','register','reset','recovery','profile'];
let adapter=null,client=null,busy=false,recovery=false;
function view(name){forms.forEach(id=>{$(id).hidden=id!==name});$('nav').hidden=['profile','recovery'].includes(name);$('logout').hidden=!['profile','recovery'].includes(name)}
function clear(){for(const id of forms)$(id).reset()}
function locked(){forms.forEach(id=>{$(id).hidden=true});$('nav').hidden=true;$('logout').hidden=true}
async function showProfile(){const p=await adapter.loadProfile();$('profile').reset();if(p)for(const [k,v] of Object.entries(p)){const el=$('profile').elements.namedItem(k);if(el)el.value=v}view('profile');say(p?'Business profile loaded.':'Create your business profile.')}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn()}catch(e){say(e instanceof Error?e.message:'Unable to complete request.')}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false)}}
async function start(){
 // The generated config exists only in an independently built protected preview.
 const cfg=await import('./account-config.mjs');
 if(location.protocol!=='https:'||location.hostname!==cfg.allowedHost||!/^ao-marketplace-preview-[a-z0-9-]+\.vercel\.app$/.test(location.hostname)){locked();say('Account access is disabled on this host.');return}
 if(cfg.projectUrl!=='https://hsitmryzukpldqenfhcu.supabase.co'||typeof cfg.createClient!=='function'||!cfg.publishableKey?.startsWith('sb_publishable_')||cfg.enablePreviewTesting!==true)throw Error('Invalid isolated development configuration.');
 client=cfg.createClient(cfg.projectUrl,cfg.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 adapter=createMarketplaceAuth(client,{callbackUrl:location.origin+location.pathname,captchaRequired:false});
 // CAPTCHA must be configured before any customer access. No protection is disabled in Supabase.
 client.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){recovery=true;view('recovery');say('Choose a new password.')}else if(event==='SIGNED_OUT'){recovery=false;clear();view('login');say('Signed out.')}});
 for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{if(!busy){clear();view(b.dataset.view);say('')}});
 const bind=(id,fn)=>$(id).addEventListener('submit',e=>{e.preventDefault();if(!adapter)return;const data=Object.fromEntries(new FormData(e.currentTarget));run(()=>fn(data))});
 bind('register',async d=>{const r=await adapter.register({...d,captchaToken:undefined});clear();view('login');say(r.message)});
 bind('login',async d=>{await adapter.signIn({...d,captchaToken:undefined});clear();if(!recovery)await showProfile()});
 bind('reset',async d=>{const r=await adapter.requestPasswordReset({...d,captchaToken:undefined});clear();view('login');say(r.message)});
 bind('recovery',async d=>{if(!recovery)throw Error('Recovery link required');await adapter.updatePassword(d.password);recovery=false;await adapter.signOut();clear();view('login');say('Password updated. Sign in again.')});
 bind('profile',async d=>{await adapter.saveProfile(d);say('Business profile saved.')});
 $('logout').addEventListener('click',()=>run(async()=>{await adapter.signOut();clear();view('login');say('Signed out.')}));
 // Await provider initialisation; recovery event takes precedence over profile.
 const {data}=await client.auth.getSession();if(recovery)return;if(data?.session){try{await showProfile();return}catch{await adapter.signOut()}}view('login');say('Sign in or create a test account.');
}
for(const id of forms)$(id).addEventListener('submit',e=>e.preventDefault());
start().catch(()=>{locked();say('Protected preview authentication configuration is not ready.')});
