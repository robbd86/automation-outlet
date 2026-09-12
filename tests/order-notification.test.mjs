import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { updateOrderNotificationStatus } from "../lib/order-notification.mjs";

let oldFetch, oldToken;
beforeEach(() => {
  oldFetch = global.fetch;
  oldToken = process.env.AO_GITHUB_TOKEN;
  process.env.AO_GITHUB_TOKEN = "github-test";
});
afterEach(() => {
  global.fetch = oldFetch;
  if (oldToken === undefined) delete process.env.AO_GITHUB_TOKEN;
  else process.env.AO_GITHUB_TOKEN = oldToken;
});

test("dispatch updates notification title, body status and closes issue", async () => {
  let patched = null;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith("/issues/163") && !options.method) {
      return {
        ok: true,
        json: async () => ({
          title: "NEW AO ORDER · £8.95 · Robert Day",
          body: "# New Automation Outlet order\n\n## Payment\n- **Status:** Paid · awaiting dispatch\n",
          state: "open",
        }),
      };
    }
    if (value.endsWith("/issues/163") && options.method === "PATCH") {
      patched = JSON.parse(options.body);
      return { ok: true, json: async () => ({ number: 163, ...patched }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };

  const result = await updateOrderNotificationStatus(163, "dispatched");
  assert.equal(result.state, "closed");
  assert.equal(patched.title, "DISPATCHED AO ORDER · £8.95 · Robert Day");
  assert.match(patched.body, /^# Dispatched Automation Outlet order/m);
  assert.match(patched.body, /\*\*Status:\*\* Paid · dispatched/);
});

test("awaiting dispatch reopens issue and restores body status", async () => {
  let patched = null;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith("/issues/164") && !options.method) {
      return {
        ok: true,
        json: async () => ({
          title: "DISPATCHED AO ORDER · £99.00 · Buyer",
          body: "# Dispatched Automation Outlet order\n\n- **Status:** Paid · dispatched\n",
          state: "closed",
        }),
      };
    }
    if (value.endsWith("/issues/164") && options.method === "PATCH") {
      patched = JSON.parse(options.body);
      return { ok: true, json: async () => ({ number: 164, ...patched }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };

  const result = await updateOrderNotificationStatus(164, "awaiting_dispatch");
  assert.equal(result.state, "open");
  assert.equal(patched.title, "NEW AO ORDER · £99.00 · Buyer");
  assert.match(patched.body, /^# New Automation Outlet order/m);
  assert.match(patched.body, /\*\*Status:\*\* Paid · awaiting dispatch/);
});
