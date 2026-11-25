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
 // Never activate on the original AO preview or production host.
 if(!['localhost','127.0.0.1'].includes(location.hostname)){locked();say('Account access is disabled on this host.');return}
 // Local file intentionally absent from GitHub: configuration must be explicit.
 const cfg=await import('./account-config.local.mjs');
 if(cfg.projectUrl!=='https://hsitmryzukpldqenfhcu.supabase.co'||typeof cfg.createClient!=='function'||!cfg.publishableKey?.startsWith('sb_publishable_')||cfg.enableLocalTesting!==true)throw Error('Invalid isolated development configuration.');
 client=cfg.createClient(cfg.projectUrl,cfg.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 adapter=createMarketplaceAuth(client,{callbackUrl:location.origin+location.pathname,captchaRequired:true});
 if(typeof cfg.getCaptchaToken!=='function')throw Error('Local CAPTCHA provider required.');
 client.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){recovery=true;view('recovery');say('Choose a new password.')}else if(event==='SIGNED_OUT'){recovery=false;clear();view('login');say('Signed out.')}});
 for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{if(!busy){clear();view(b.dataset.view);say('')}});
 const bind=(id,fn)=>$(id).addEventListener('submit',e=>{e.preventDefault();if(!adapter)return;const data=Object.fromEntries(new FormData(e.currentTarget));run(()=>fn(data))});
 bind('register',async d=>{const r=await adapter.register({...d,captchaToken:await cfg.getCaptchaToken()});clear();view('login');say(r.message)});
 bind('login',async d=>{await adapter.signIn({...d,captchaToken:await cfg.getCaptchaToken()});clear();if(!recovery)await showProfile()});
 bind('reset',async d=>{const r=await adapter.requestPasswordReset({...d,captchaToken:await cfg.getCaptchaToken()});clear();view('login');say(r.message)});
 bind('recovery',async d=>{if(!recovery)throw Error('Recovery link required');await adapter.updatePassword(d.password);recovery=false;await adapter.signOut();clear();view('login');say('Password updated. Sign in again.')});
 bind('profile',async d=>{await adapter.saveProfile(d);say('Business profile saved.')});
 $('logout').addEventListener('click',()=>run(async()=>{await adapter.signOut();clear();view('login');say('Signed out.')}));
 // Await provider initialisation; recovery event takes precedence over profile.
 const {data}=await client.auth.getSession();if(recovery)return;if(data?.session){try{await showProfile();return}catch{await adapter.signOut()}}view('login');say('Sign in or create a test account.');
}
for(const id of forms)$(id).addEventListener('submit',e=>e.preventDefault());
start().catch(()=>{locked();say('Local authentication configuration is not ready. No request has been sent by this form.')});
