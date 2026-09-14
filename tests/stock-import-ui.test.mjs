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


test("bulk importer keeps per-item include controls visible in the responsive card layout", () => {
  assert.match(source, /ebay-pick-wrap/);
  assert.ok(source.includes("checkbox.checked = item.duplicate ? false : item.selected !== false;"));
  assert.match(source, /checkbox\.disabled = item\.duplicate/);
  assert.match(source, /pickText\.textContent = item\.duplicate \? "Skip" : "Include"/);
  assert.doesNotMatch(source, /min-width:1420px/);
  assert.doesNotMatch(source, /ebay-preview\{overflow-x:auto\}/);
});


test("bulk import shows live progress and does not overwrite the final result", () => {
  assert.match(source, /ebayImportProgress/);
  assert.ok(source.includes('importButton.textContent = `Importing ${i + 1}/${selected.length}…`;'));
  assert.ok(source.includes("const finalMessage = failures.length"));
  const refreshed = source.indexOf("    renderPreview();\\n\\n    const finalMessage");
  const finalStatus = source.indexOf("    setImportStatus(finalMessage", refreshed);
  assert.ok(refreshed >= 0 && finalStatus > refreshed);
});

test("bulk import autosaves and can recover unfinished edits", () => {
  assert.match(source, /aoEbayImportDraftV1/);
  assert.ok(source.includes("localStorage.setItem(DRAFT_STORE"));
  assert.match(source, /Recovered your unfinished bulk-import draft/);
  assert.ok(source.includes("clearDraft();"));
});
