import crypto from "node:crypto";

const OPENAI_BASE = "https://api.openai.com/v1";
const GITHUB_API_VERSION = "2022-11-28";
const STORAGE_REPO = process.env.AO_GITHUB_REPO || "robbd86/automation-outlet-site";

function json(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(body);
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(request) {
  const expected = process.env.AO_DEAL_DESK_KEY;
  const supplied = request.headers["x-deal-desk-key"];
  return Boolean(expected && secureEqual(supplied, expected));
}

function clean(value, max = 500) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, max);
}

function safeSlug(value) {
  return clean(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "automation-part";
}

function extractDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  return { mime, base64: match[2] };
}

async function openaiResponse(body) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const error = new Error("OpenAI API key is not configured");
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${OPENAI_BASE}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || `OpenAI image review failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Photo review took too long. Try fewer photos or retry.");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function outputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const parts = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

const photoSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    detectedPartNumber: { type: "string", maxLength: 120 },
    detectedBrand: { type: "string", maxLength: 80 },
    detectedRevision: { type: "string", maxLength: 120 },
    confidence: { type: "string", enum: ["High", "Medium", "Low"] },
    heroIndex: { type: "integer", minimum: 0 },
    labelIndex: { type: "integer", minimum: -1 },
    heroReason: { type: "string", maxLength: 300 },
    visibleSpecs: { type: "array", maxItems: 8, items: { type: "string", maxLength: 180 } },
    accessoriesVisible: { type: "array", maxItems: 8, items: { type: "string", maxLength: 160 } },
    conditionNotes: { type: "array", maxItems: 6, items: { type: "string", maxLength: 180 } },
    damageNotes: { type: "array", maxItems: 6, items: { type: "string", maxLength: 180 } },
    missingShots: { type: "array", maxItems: 6, items: { type: "string", maxLength: 180 } },
    listingNotesAppend: { type: "string", maxLength: 900 },
    imageReviews: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer", minimum: 0 },
          role: { type: "string", enum: ["hero", "label", "detail", "accessory", "damage", "duplicate", "poor"] },
          quality: { type: "string", enum: ["Good", "Usable", "Poor"] },
          usable: { type: "boolean" },
          note: { type: "string", maxLength: 220 }
        },
        required: ["index", "role", "quality", "usable", "note"]
      }
    }
  },
  required: [
    "detectedPartNumber", "detectedBrand", "detectedRevision", "confidence",
    "heroIndex", "labelIndex", "heroReason", "visibleSpecs", "accessoriesVisible",
    "conditionNotes", "damageNotes", "missingShots", "listingNotesAppend", "imageReviews"
  ]
};

async function analysePhotos(request, response) {
  const images = Array.isArray(request.body?.images) ? request.body.images.slice(0, 8) : [];
  if (!images.length) return json(response, 400, { error: "Add at least one photo" });

  let approxBytes = 0;
  const content = [{
    type: "input_text",
    text: [
      "You are Automation Outlet's industrial automation photo reviewer.",
      "Review the supplied product photos as ONE listing item. Images are numbered from 0 in the order supplied.",
      "Read labels visually where possible, but never invent unreadable text. Preserve exact punctuation in part numbers.",
      "Choose the strongest eBay/website hero image: sharp, centred, product clearly visible, least clutter, no obvious duplicate.",
      "Identify the clearest label image, visible accessories, damage/cosmetic concerns, missing useful photos and specs that are genuinely visible.",
      "Do not claim an electrical/function test from appearance alone.",
      "listingNotesAppend should be concise factual notes that can safely be fed into a resale listing.",
      `Part-number hint from user: ${clean(request.body?.partNumber, 120) || "none"}`,
      `Condition selected by user: ${clean(request.body?.condition, 100) || "not selected"}`,
    ].join("\n")
  }];

  images.forEach((image, index) => {
    const parsed = extractDataUrl(image?.dataUrl);
    if (!parsed) return;
    approxBytes += Buffer.byteLength(parsed.base64, "base64");
    content.push({ type: "input_text", text: `IMAGE ${index}: ${clean(image?.name, 120) || "photo"}` });
    content.push({ type: "input_image", image_url: image.dataUrl, detail: "auto" });
  });

  if (content.filter((x) => x.type === "input_image").length !== images.length) {
    return json(response, 400, { error: "One or more photos could not be read" });
  }
  if (approxBytes > 10 * 1024 * 1024) {
    return json(response, 413, { error: "Photo batch is too large. Use fewer photos." });
  }

  const result = await openaiResponse({
    model: "gpt-5.6-luna",
    reasoning: { effort: "none" },
    store: false,
    input: [{ role: "user", content }],
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "ao_photo_review",
        strict: true,
        schema: photoSchema
      }
    },
    max_output_tokens: 2600,
    metadata: { app: "automation-outlet", kind: "photo-review" }
  });

  const text = outputText(result);
  let review = null;
  try {
    review = JSON.parse(text);
  } catch {
    return json(response, 502, { error: "Photo review completed but the structured result could not be read" });
  }

  if (review.heroIndex >= images.length) review.heroIndex = 0;
  if (review.labelIndex >= images.length) review.labelIndex = -1;

  return json(response, 200, {
    review,
    usage: result.usage || null,
    model: "gpt-5.6-luna"
  });
}

async function storageGithub(path, options = {}) {
  const token = process.env.AO_GITHUB_TOKEN;
  if (!token) {
    const error = new Error("Image storage is not configured");
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://api.github.com/repos/${STORAGE_REPO}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "automation-outlet-photo-agent",
        ...(options.headers || {})
      }
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : Buffer.from(await response.arrayBuffer());

    if (!response.ok) {
      const message = Buffer.isBuffer(data) ? "" : data?.message;
      const error = new Error(message || `GitHub image storage failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Image storage timed out");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function storeListingImage(filename, base64) {
  const path = `listing-images/${filename}`;
  await storageGithub(`/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Add listing image ${filename}`,
      content: base64
    })
  });
  return path;
}


async function uploadHero(request, response) {
  const parsed = extractDataUrl(request.body?.dataUrl);
  if (!parsed || parsed.mime !== "image/jpeg") {
    return json(response, 400, { error: "Branded hero must be a JPEG image" });
  }

  const bytes = Buffer.byteLength(parsed.base64, "base64");
  if (bytes > 3 * 1024 * 1024) {
    return json(response, 413, { error: "Branded hero is too large to upload" });
  }

  const part = safeSlug(request.body?.partNumber);
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const nonce = crypto.randomBytes(2).toString("hex");
  const filename = `${part}-${stamp}-${nonce}.jpg`;
  const path = await storeListingImage(filename, parsed.base64);
  const url = `https://automation-outlet.co.uk/listing-image/${encodeURIComponent(filename)}`;

  return json(response, 200, { url, path, storage: "private-stock-store" });
}

export async function serveListingImage(request, response) {
  try {
    const filename = clean(request.query?.photoImage, 160).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.jpg$/.test(filename)) {
      response.status(404).end();
      return;
    }

    const token = process.env.AO_GITHUB_TOKEN;
    if (!token) {
      response.status(503).end();
      return;
    }

    const githubResponse = await fetch(
      `https://api.github.com/repos/${STORAGE_REPO}/contents/listing-images/${encodeURIComponent(filename)}`,
      {
        headers: {
          Accept: "application/vnd.github.raw",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
          "User-Agent": "automation-outlet-listing-image"
        }
      }
    );

    if (!githubResponse.ok) {
      response.status(githubResponse.status === 404 ? 404 : 502).end();
      return;
    }

    const bytes = Buffer.from(await githubResponse.arrayBuffer());
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Length", String(bytes.length));
    response.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    response.status(200).send(bytes);
  } catch (error) {
    console.error("AO listing image error", error);
    response.status(500).end();
  }
}

export default async function handler(request, response) {
  try {
    if (!requireAdmin(request)) return json(response, 401, { error: "Invalid Automation Outlet admin key" });
    if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });

    const action = clean(request.body?.action, 30);
    if (action === "analyse") return await analysePhotos(request, response);
    if (action === "upload-hero") return await uploadHero(request, response);
    return json(response, 400, { error: "Unknown photo action" });
  } catch (error) {
    console.error("AO photo agent error", error);
    return json(response, Number(error.status) || 500, { error: error.message || "Photo agent failed" });
  }
}
