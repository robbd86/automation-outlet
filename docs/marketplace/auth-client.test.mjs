import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketplaceAuth} from './auth-client.mjs';
function mock({verified=true,error=null}={}) {
  const calls=[];
  const user={id:'seller-test',email_confirmed_at:verified?'2026-11-25T00:00:00Z':null};
  const chain={select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null}),insert:async v=>{calls.push(['insert',v]);return {error:null}}};
  const auth={signUp:async v=>{calls.push(['register',v]);return {error}},signInWithPassword:async v=>{calls.push(['signIn',v]);return {error}},getUser:async()=>({data:{user},error:null}),signOut:async()=>{calls.push(['signOut']);return {error:null}},resetPasswordForEmail:async(...v)=>{calls.push(['reset',...v]);return {error}},updateUser:async()=>({error})};
  return {client:{auth,schema:()=>({from:()=>chain})},calls};
}
const config={callbackUrl:'http://localhost:3000/auth/callback',captchaRequired:false};
test('refuses production callback',()=>{const {client}=mock();assert.throws(()=>createMarketplaceAuth(client,{callbackUrl:'https://www.automation-outlet.co.uk/auth'}),/Production/);});
test('rejects weak password and missing captcha before calling provider',async()=>{const {client,calls}=mock();const a=createMarketplaceAuth(client,{...config,captchaRequired:true});await assert.rejects(a.register({email:'test@example.invalid',password:'short',captchaToken:'test'}),/12/);await assert.rejects(a.register({email:'test@example.invalid',password:'fictional-long-password'}),/security/);assert.equal(calls.length,0);});
test('register sends only email/password and configured redirect',async()=>{const {client,calls}=mock();const a=createMarketplaceAuth(client,config);await a.register({email:' TEST@example.invalid ',password:'fictional-long-password',role:'admin'});assert.equal(calls[0][1].email,'test@example.invalid');assert.equal(calls[0][1].options.emailRedirectTo,config.callbackUrl);assert.equal(calls[0][1].role,undefined);});
test('unverified seller cannot access profiles',async()=>{const {client,calls}=mock({verified:false});const a=createMarketplaceAuth(client,config);await assert.rejects(a.saveProfile({display_name:'Test',company_name:'Test company',region:'Test region'}),/verified/);await assert.rejects(a.signIn({email:'test@example.invalid',password:'fictional-long-password'}),/verified/);assert.ok(calls.some(x=>x[0]==='signOut'));});
test('profile owner comes from verified user; approval fields ignored',async()=>{const {client,calls}=mock();const a=createMarketplaceAuth(client,config);await a.saveProfile({display_name:'Test',company_name:'Test company',region:'Test region',user_id:'other-user',approved:true,role:'admin'});assert.deepEqual(calls[0][1],{display_name:'Test',company_name:'Test company',region:'Test region',user_id:'seller-test'});});
test('provider errors do not reveal raw details',async()=>{const {client}=mock({error:{message:'private debug detail'}});const a=createMarketplaceAuth(client,config);await assert.rejects(a.register({email:'test@example.invalid',password:'fictional-long-password'}),/Unable to register/);});
