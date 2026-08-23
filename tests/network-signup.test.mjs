import test from "node:test";
import assert from "node:assert/strict";
import handler, { normaliseSignup, validateSignup } from "../api/network-signup.mjs";

test("normalises a valid buyer signup and preserves multiple categories", () => {
  const signup = normaliseSignup({
    signup_type: "buyer-network",
    name: "  Test Buyer  ",
    email: "BUYER@EXAMPLE.COM",
    consent: "yes",
    buyer_type: "End user / manufacturer",
    buying_volume: "Small quantities",
    categories: ["PLC / CPU", "Drives", "Drives"],
    condition: "Used tested is fine",
    preferred_contact: "Email",
  });
  assert.equal(validateSignup(signup), "");
  assert.equal(signup.name, "Test Buyer");
  assert.equal(signup.email, "buyer@example.com");
  assert.deepEqual(signup.categories, ["PLC / CPU", "Drives"]);
});

test("normalises a valid supplier signup", () => {
  const signup = normaliseSignup({
    signup_type: "supplier-network",
    name: "Test Supplier",
    email: "supplier@example.com",
    consent: true,
    supplier_type: "Panel builder",
    stock_types: ["Panels", "PLC / CPU"],
    frequency: "Monthly",
    preferred_route: "Outright cash purchase",
  });
  assert.equal(validateSignup(signup), "");
  assert.deepEqual(signup.stockTypes, ["Panels", "PLC / CPU"]);
});

test("rejects invalid signup types, email addresses and missing consent", () => {
  assert.equal(validateSignup(normaliseSignup({ signup_type: "other" })), "Invalid signup type");
  const signup = normaliseSignup({
    signup_type: "buyer-network",
    name: "Test",
    email: "not-an-email",
    buyer_type: "End user / manufacturer",
    buying_volume: "Small quantities",
    condition: "New or used",
    preferred_contact: "Email",
  });
  assert.equal(validateSignup(signup), "A valid email is required");
  signup.email = "test@example.com";
  assert.equal(validateSignup(signup), "Consent is required");
});

test("drops select values that are not present in the Airtable schema", () => {
  const signup = normaliseSignup({
    signup_type: "supplier-network",
    name: "Test",
    email: "test@example.com",
    consent: "yes",
    supplier_type: "Invented type",
    stock_types: ["Panels", "Invented stock"],
    frequency: "Monthly",
    preferred_route: "Outright cash purchase",
  });
  assert.equal(signup.supplierType, "");
  assert.deepEqual(signup.stockTypes, ["Panels"]);
  assert.equal(validateSignup(signup), "One or more supplier selections are invalid");
});

test("handler upserts by email before sending the secondary notification", async () => {
  process.env.AIRTABLE_ACCESS_TOKEN = "test-token";
  process.env.AIRTABLE_BASE_ID = "appTestBase";
  process.env.AIRTABLE_BUYERS_TABLE_ID = "tblTestBuyers";
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("api.airtable.com")) {
      return new Response(JSON.stringify({ createdRecords: ["rec1"], records: [{ id: "rec1" }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const reply = { statusCode: 0, body: null };
  const response = {
    setHeader() {},
    status(code) { reply.statusCode = code; return this; },
    json(body) { reply.body = body; return this; },
    end() { return this; },
  };
  try {
    await handler({
      method: "POST",
      headers: {},
      body: {
        signup_type: "buyer-network",
        name: "Test Buyer",
        email: "Buyer@Example.com",
        consent: "yes",
        buyer_type: "End user / manufacturer",
        buying_volume: "Small quantities",
        categories: ["PLC / CPU"],
        condition: "Used tested is fine",
        preferred_contact: "Email",
      },
    }, response);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(reply.statusCode, 200);
  assert.deepEqual(reply.body, { ok: true, action: "created", message: "Signup saved" });
  assert.equal(calls.length, 2);
  const airtableBody = JSON.parse(calls[0].options.body);
  assert.deepEqual(airtableBody.performUpsert, { fieldsToMergeOn: ["Email"] });
  assert.equal(airtableBody.records[0].fields.Email, "buyer@example.com");
  assert.equal(calls[1].url, "https://formspree.io/f/xqevvvll");
});
