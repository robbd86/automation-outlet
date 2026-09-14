import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../stock-import.js", import.meta.url), "utf8");

test("bulk eBay importer exposes image URL and direct upload controls", () => {
  assert.match(source, /ebay-image-url/);
  assert.match(source, /upload-hero/);
  assert.match(source, /\/api\/photo-agent/);
  assert.match(source, /image\/jpeg,image\/png,image\/webp/);
});

test("bulk eBay importer saves existing checkout delivery mode", () => {
  assert.match(source, /bulkEbayDelivery/);
  assert.match(source, /ebay-delivery/);
  assert.match(source, /deliveryMode:\s*item\.deliveryMode === "parcel" \? "parcel" : "quote"/);
  assert.match(source, /deliveryMode:\s*"quote"/);
});

test("bulk imports fail safe while an image upload is still running", () => {
  assert.match(source, /pendingUploads > 0/);
  assert.match(source, /Wait for the current image upload to finish before importing/);
});
