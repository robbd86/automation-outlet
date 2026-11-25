import test from 'node:test';import assert from 'node:assert/strict';import {validateListing} from './listing-client.mjs';
const base={manufacturer:'Siemens',part_number:'6ES7-TEST',title:'Test PLC',description:'Fictional unit',region:'Test',category:'PLC / CPU',condition:'New boxed',vat_treatment:'Not applicable',delivery:'Courier only',price:'123.45',quantity:'2'};
test('converts pounds exactly to pence',()=>assert.equal(validateListing(base).price_pence,12345));
test('rejects invalid prices',()=>{for(const price of ['0','-1','1.001','1e2','NaN',''])assert.throws(()=>validateListing({...base,price}));});
test('rejects invalid quantities',()=>{for(const quantity of ['0','1.5','10001','-2'])assert.throws(()=>validateListing({...base,quantity}));});
test('requires part number and category',()=>{assert.throws(()=>validateListing({...base,part_number:'---'}));assert.throws(()=>validateListing({...base,category:'wrong'}));});
test('ignores ownership and moderation injection',()=>{const v=validateListing({...base,seller_id:'other',status:'published',expires_at:'2099-01-01'});assert.equal(v.seller_id,undefined);assert.equal(v.status,undefined);assert.equal(v.expires_at,undefined);});
