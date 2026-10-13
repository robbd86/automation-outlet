import test from "node:test";
import assert from "node:assert/strict";
import {signature,unsubLink,validSignature} from "../lib/quick-check-unsubscribe.mjs";
test("signed unsubscribe links are scoped to the original lead",()=>{
 const before=process.env.AO_DEAL_DESK_KEY;
 try{
  process.env.AO_DEAL_DESK_KEY="private-key-in-env";
  const a="recAAAAAAAAAAAAAA",b="recBBBBBBBBBBBBBB";
  const s=signature(a);
  assert.match(s,/^[a-f0-9]{64}$/);
  assert.equal(validSignature(a,s),true);
  assert.equal(validSignature(b,s),false);
  assert.equal(validSignature(a,"x".repeat(64)),false);
  assert.match(unsubLink(a),/https:\/\/www\.automation-outlet\.co\.uk\/quick-check-unsubscribe/);
 }finally{if(before===undefined)delete process.env.AO_DEAL_DESK_KEY;else process.env.AO_DEAL_DESK_KEY=before;}
});