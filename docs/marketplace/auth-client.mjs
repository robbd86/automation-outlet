/**
 * AO Marketplace — auth adapter for the isolated dev application.
 * Pass an official @supabase/supabase-js v2 client configured with the
 * DEVELOPMENT project's URL and publishable key. No credentials in this file.
 * Not imported by the existing website or the network-disabled prototype.
 */
export function createMarketplaceAuth(client, { callbackUrl, captchaRequired = true } = {}) {
  if (!client?.auth || typeof client.schema !== 'function') throw new Error('Dev auth client required');
  const callback = new URL(callbackUrl);
  if (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && ['localhost','127.0.0.1'].includes(callback.hostname))) throw new Error('Use an HTTPS callback or local development');
  if (/(^|\.)automation-outlet\.co\.uk$/i.test(callback.hostname)) throw new Error('Production callback prohibited during development');
  if (callback.username || callback.password || callback.search || callback.hash) throw new Error('Invalid callback URL');
  const db = client.schema('marketplace');
  function captcha(token) {
    if (captchaRequired && (typeof token !== 'string' || !token.trim())) throw new Error('Complete the security check');
    return token ? { captchaToken: token } : {};
  }
  function emailAddress(value) {
    const s = String(value ?? '').trim().toLowerCase();
    if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error('Enter a valid email address');
    return s;
  }
  function newPassword(value) {
    if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw new Error('Use a password of 12–128 characters');
    return value;
  }
  function profileFields(input) {
    const fields = {};
    for (const [key,max] of [['display_name',100],['company_name',160],['region',100]]) {
      const s = String(input?.[key] ?? '').trim();
      if (!s || s.length > max) throw new Error('Complete all business profile fields');
      fields[key] = s;
    }
    return fields;
  }
  async function verifiedUser() {
    const {data,error} = await client.auth.getUser();
    if (error || !data?.user?.id || !data.user.email_confirmed_at) throw new Error('Sign in with a verified email address');
    return data.user;
  }
  return Object.freeze({
    async register({email,password,captchaToken}) {
      const options = {emailRedirectTo:callback.href,...captcha(captchaToken)};
      const {error} = await client.auth.signUp({email:emailAddress(email),password:newPassword(password),options});
      if(error) throw new Error('Unable to register. Check your details or try again later.');
      // Do not reveal whether this email was already registered.
      return {message:'Check your email for the next steps.'};
    },
    async signIn({email,password,captchaToken}) {
      if(typeof password!=='string'||!password||password.length>128) throw new Error('Enter your password');
      const {error} = await client.auth.signInWithPassword({email:emailAddress(email),password,options:captcha(captchaToken)});
      if(error) throw new Error('Unable to sign in. Check your details and email verification.');
      try { return await verifiedUser(); }
      catch { await client.auth.signOut({scope:'local'}); throw new Error('A verified email address is required'); }
    },
    async signOut() {
      const {error}=await client.auth.signOut({scope:'local'});
      if(error) throw new Error('Unable to sign out');
    },
    async requestPasswordReset({email,captchaToken}) {
      const {error}=await client.auth.resetPasswordForEmail(emailAddress(email),{redirectTo:callback.href,...captcha(captchaToken)});
      if(error) throw new Error('Unable to process request. Try again later.');
      return {message:'If eligible, you will receive instructions by email.'};
    },
    // Call ONLY from the recovery view after a PASSWORD_RECOVERY auth event.
    // Provider verification/session rules enforce access; UI recovery event
    // must not be used as a substitute for verified authentication.
    async updatePassword(password) {
      await verifiedUser();
      const {error}=await client.auth.updateUser({password:newPassword(password)});
      if(error) throw new Error('Unable to update password');
    },
    async loadProfile() {
      const user=await verifiedUser();
      const {data,error}=await db.from('profiles').select('display_name,company_name,region').eq('user_id',user.id).maybeSingle();
      if(error) throw new Error('Unable to load business profile');
      return data;
    },
    async saveProfile(input) {
      const fields=profileFields(input);
      const user=await verifiedUser();
      // Insert if absent; otherwise update only mutable fields.
      const {data:existing,error:readError}=await db.from('profiles').select('user_id').eq('user_id',user.id).maybeSingle();
      if(readError) throw new Error('Unable to load business profile');
      const query=existing ? db.from('profiles').update(fields).eq('user_id',user.id) : db.from('profiles').insert({...fields,user_id:user.id});
      const {error}=await query;
      if(error) throw new Error('Unable to save business profile');
      return fields;
    },
    verifiedUser
  });
}
