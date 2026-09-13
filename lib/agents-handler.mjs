import crypto from "node:crypto";

const OPENAI_BASE = "https://api.openai.com/v1";
const ALLOWED_KINDS = new Set(["listing", "deal"]);
const GITHUB_API_VERSION = "2022-11-28";
const DEFAULT_STORAGE_REPO = "robbd86/automation-outlet-site";
const LISTING_CACHE_PREFIX = "AO Agent Cache";
const LISTING_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function clean(value, max = 8000) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, max);
}

function sessionId(value) {
  const id = clean(value, 160);
  return /^[A-Za-z0-9_-]{5,160}$/.test(id) ? id : "";
}

function listingCacheKey(input) {
  const part = clean(input?.partNumber, 160).toUpperCase().replace(/\s+/g, "");
  const condition = clean(input?.condition, 120).toLowerCase().replace(/\s+/g, " ");
  if (!part || !condition) return "";
  return crypto.createHash("sha256").update(part + "\n" + condition).digest("hex").slice(0, 24);
}

function storageSettings() {
  return {
    token: process.env.AO_GITHUB_TOKEN,
    repo: process.env.AO_GITHUB_REPO || DEFAULT_STORAGE_REPO,
  };
}

async function storageGithub(path, options = {}) {
  const { token, repo } = storageSettings();
  if (!token) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "automation-outlet-agent-cache",
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.message || `GitHub cache request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("GitHub research cache timed out");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function encodeCacheRecord(record) {
  return Buffer.from(JSON.stringify(record), "utf8").toString("base64");
}

function decodeCacheRecord(body) {
  const match = String(body || "").match(/<!-- AO_AGENT_CACHE_B64:([A-Za-z0-9+/=]+) -->/);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function findListingCacheIssue(key) {
  if (!key || !process.env.AO_GITHUB_TOKEN) return null;
  const issues = await storageGithub("/issues?state=open&per_page=100&sort=updated&direction=desc");
  if (!Array.isArray(issues)) return null;
  const titlePrefix = `${LISTING_CACHE_PREFIX} · ${key} ·`;
  return issues.find((issue) =>
    !issue?.pull_request &&
    String(issue?.title || "").startsWith(titlePrefix)
  ) || null;
}

async function readListingCache(input) {
  const key = listingCacheKey(input);
  if (!key || !process.env.AO_GITHUB_TOKEN) return { key, hit: false };

  try {
    const issue = await findListingCacheIssue(key);
    if (!issue) return { key, hit: false };

    const record = decodeCacheRecord(issue.body);
    if (!record?.research || !record?.expiresAt) return { key, hit: false };

    const expiresAt = Date.parse(record.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { key, hit: false, expired: true };
    }

    const createdAt = Date.parse(record.createdAt || record.updatedAt || "");
    const ageHours = Number.isFinite(createdAt)
      ? Math.max(0, Math.round((Date.now() - createdAt) / 3600000))
      : null;

    return {
      key,
      hit: true,
      ageHours,
      issueNumber: issue.number,
      research: record.research,
    };
  } catch (error) {
    console.warn("AO listing cache read failed", error.message);
    return { key, hit: false };
  }
}

async function writeListingCache(key, result) {
  if (!key || !process.env.AO_GITHUB_TOKEN || !isCompleteListingResult(result)) return;

  try {
    const now = new Date();
    const record = {
      schema: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LISTING_CACHE_TTL_MS).toISOString(),
      key,
      partNumber: clean(result.partNumber, 160).toUpperCase(),
      condition: clean(result.condition, 120),
      research: {
        brand: clean(result.brand, 120),
        identification: clean(result.identification, 600),
        category: clean(result.category, 120),
        recommendedPriceGbp: Number(result.recommendedPriceGbp || 0),
        priceLowGbp: Number(result.priceLowGbp || 0),
        priceHighGbp: Number(result.priceHighGbp || 0),
        pricingNotes: clean(result.pricingNotes, 1000),
        pricingConfidence: clean(result.pricingConfidence, 20),
        marketEvidence: Array.isArray(result.marketEvidence) ? result.marketEvidence.slice(0, 3) : [],
      },
    };

    const title = `${LISTING_CACHE_PREFIX} · ${key} · ${record.partNumber}`;
    const body = [
      "Private working cache for Automation Outlet Listing Agent research.",
      "",
      `Expires: ${record.expiresAt}`,
      "",
      `<!-- AO_AGENT_CACHE_B64:${encodeCacheRecord(record)} -->`,
    ].join("\n");

    const existing = await findListingCacheIssue(key);
    if (existing?.number) {
      await storageGithub(`/issues/${existing.number}`, {
        method: "PATCH",
        body: JSON.stringify({ title, body }),
      });
    } else {
      await storageGithub("/issues", {
        method: "POST",
        body: JSON.stringify({ title, body }),
      });
    }
  } catch (error) {
    console.warn("AO listing cache write failed", error.message);
  }
}

async function openai(path, options = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const error = new Error("OpenAI API key is not configured");
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const isSessionStart = path === "/agents/sessions" && options.method === "POST";
  const timeout = setTimeout(() => controller.abort(), isSessionStart ? 30000 : 15000);

  try {
    const response = await fetch(`${OPENAI_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "agents=v1",
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || data?.message || `OpenAI request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(
        isSessionStart
          ? "OpenAI took too long to start the agent. Please retry."
          : "OpenAI status request timed out. Please retry."
      );
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const listingInstructions = `
You are the Automation Outlet Listing Agent for a UK industrial automation reseller.
Your job is to turn sparse part information into a commercially useful, accurate listing draft.

Rules:
- Use web search when it materially improves identification, specifications or current market pricing.
- Keep research efficient: use no more than 2 focused web searches for a normal listing. Stop as soon as you have enough evidence to identify the exact part and set a realistic price.
- Prefer manufacturer documentation and credible industrial automation resellers. Marketplaces can be used as supporting price signals.
- Never invent specifications, condition, test status, packaging or compatibility. If evidence is weak, put the uncertainty in checks.
- Prices must be in GBP and should be realistic achievable resale prices, not optimistic asking prices.
- Price from the stated condition first. Do not blend used, refurbished, new-surplus and new-sealed evidence into one average.
- For Used - tested working stock, prioritise same-condition used/tested market evidence. Active used asking prices are secondary. Refurbished dealer prices are mainly an upper ceiling, and new/new-surplus prices are weaker ceiling evidence.
- Adjust comparable prices for seller value-add. If the closest competing listing includes a meaningful dealer warranty, tested/refurbished certification, free returns, VAT invoice, technical support or other service that Automation Outlet is not matching, do not simply match that price. Apply a sensible downward adjustment and explain it in pricingNotes.
- For new-sealed stock, compare against other genuinely new-sealed stock first, but still discount competitors whose price includes materially stronger warranty/returns/service terms. Treat authorised-distributor pricing as a ceiling unless the market actually supports it.
- Prefer completed/sold evidence where genuinely available, but never claim sold evidence unless you actually found it.
- Ignore obvious outliers, unusually high dealer asks, multi-item bundle prices, different revisions, safety/conformal-coated/special variants, or listings that are not genuinely comparable.
- recommendedPriceGbp is the normal Automation Outlet asking price: competitive enough to have a realistic chance of selling without sitting for many months.
- priceLowGbp is the QUICK-SALE target: the price you would use when prioritising a faster sale, normally below recommendedPriceGbp and grounded in same-condition evidence.
- priceHighGbp is a STRETCH ceiling only: use it only where condition, test evidence, packaging, scarcity or accessories justify it. Do not present the highest market asking price as the high value by default.
- For ordinary used/tested stock, a quick-sale target will often be roughly 8-15% below the recommended ask, but market evidence overrides this rule of thumb.
- If same-condition evidence is sparse, be conservative, lower confidence, and explain the limitation in pricingNotes/checks.
- pricingNotes must briefly explain which condition-level evidence drove the recommendation and why refurbished/new evidence was discounted or treated as a ceiling.
- pricingConfidence must be High, Medium or Low. Use High only when several strong, genuinely comparable same-condition market signals agree; Medium when evidence is useful but limited/mixed; Low when evidence is sparse, overseas-heavy, old, or mostly non-comparable ceiling evidence.
- marketEvidence must contain the 2 to 3 strongest ACTUAL comparable market references you used. Include source/seller name, URL, price in GBP, condition, evidence type and any meaningful warranty/service note. Never invent a URL, price, warranty or seller. If fewer than 2 trustworthy market references are available, return only the references actually found and lower pricingConfidence accordingly.
- Prefer evidence that most closely matches the exact part, condition, quantity and UK customer proposition. Do not pad marketEvidence with weak references merely to reach three entries.
- Automation Outlet is not VAT registered, so prices should be presented as the actual customer price rather than a net price with VAT added later.
- eBay title must be 80 characters or fewer. Website title must be 180 characters or fewer.
- Description must be concise, professional, plain text, and suitable for Automation Outlet and eBay.
- Default website status to draft and deliveryMode to quote.
- Use one of these categories where possible: PLC CPU, PLC I/O module, Communication module, HMI, Drive / inverter, Safety module, Power supply, Industrial PC, Sensor, Motor starter, Other automation.
- Preserve the user's stated condition exactly where it maps cleanly to Automation Outlet wording.
- Put anything that still needs visual or manual verification into checks.
`;

const dealInstructions = `
You are the Automation Outlet Deal Analyst for a UK industrial automation reseller.
Analyse seller stock and recommend whether Automation Outlet should buy, broker/consign, ask for more information, or pass.

Rules:
- Use web search for identification and current market evidence where useful.
- Keep research efficient: normally no more than 7 web searches for a normal enquiry.
- Use realistic achievable resale values in GBP, not the highest asking price found.
- Distinguish retail resale value, trade value and maximum cash buy price.
- Cash buy price must allow for fees, testing risk, shipping risk, time-to-sell and profit.
- Prefer seller-held consignment where that materially reduces cash/risk and still gives a strong chance of sale.
- Never claim sold-price evidence unless you actually found it.
- State uncertainty clearly.
`;

const listingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    partNumber: { type: "string" },
    brand: { type: "string" },
    identification: { type: "string", maxLength: 500 },
    category: { type: "string" },
    condition: { type: "string" },
    quantity: { type: "integer", minimum: 1 },
    listingTitle: { type: "string", maxLength: 180 },
    ebayTitle: { type: "string", maxLength: 80 },
    description: { type: "string", maxLength: 900 },
    recommendedPriceGbp: { type: "number", minimum: 0 },
    priceLowGbp: { type: "number", minimum: 0 },
    priceHighGbp: { type: "number", minimum: 0 },
    deliveryMode: { type: "string", enum: ["quote", "parcel"] },
    status: { type: "string", enum: ["draft"] },
    seoKeywords: { type: "array", maxItems: 8, items: { type: "string" } },
    checks: { type: "array", maxItems: 5, items: { type: "string" } },
    pricingNotes: { type: "string", maxLength: 800 },
    pricingConfidence: { type: "string", enum: ["High", "Medium", "Low"] },
    marketEvidence: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source: { type: "string" },
          url: { type: "string" },
          priceGbp: { type: "number", minimum: 0 },
          condition: { type: "string" },
          evidenceType: { type: "string", enum: ["sold", "asking", "dealer", "distributor", "other"] },
          warrantyService: { type: "string" }
        },
        required: ["source", "url", "priceGbp", "condition", "evidenceType", "warrantyService"]
      }
    }
  },
  required: [
    "partNumber", "brand", "identification", "category", "condition", "quantity",
    "listingTitle", "ebayTitle", "description", "recommendedPriceGbp",
    "priceLowGbp", "priceHighGbp", "deliveryMode", "status",
    "seoKeywords", "checks", "pricingNotes", "pricingConfidence", "marketEvidence"
  ]
};

const listingOutputContract = "Return JSON only with keys: partNumber, brand, identification, category, condition, quantity, listingTitle, ebayTitle, description, recommendedPriceGbp, priceLowGbp, priceHighGbp, deliveryMode ('quote'|'parcel'), status ('draft'), seoKeywords (max 8 strings), checks (max 5 strings), pricingNotes, pricingConfidence ('High'|'Medium'|'Low'), marketEvidence (2-3 actual comparables; each {source,url,priceGbp,condition,evidenceType,warrantyService}).";

const dealItemSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    partNumber: { type: "string" },
    identification: { type: "string" },
    quantity: { type: "integer", minimum: 1 },
    realisticSaleGbpEach: { type: "number", minimum: 0 },
    tradeValueGbpEach: { type: "number", minimum: 0 },
    maxBuyGbpEach: { type: "number", minimum: 0 },
    notes: { type: "string" }
  },
  required: [
    "partNumber", "identification", "quantity", "realisticSaleGbpEach",
    "tradeValueGbpEach", "maxBuyGbpEach", "notes"
  ]
};

const dealSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    recommendation: {
      type: "string",
      enum: ["buy", "consignment", "broker", "more-info", "pass"]
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    estimatedRetailGbp: { type: "number", minimum: 0 },
    estimatedTradeGbp: { type: "number", minimum: 0 },
    maxCashBuyGbp: { type: "number", minimum: 0 },
    suggestedConsignmentAskGbp: { type: "number", minimum: 0 },
    items: { type: "array", items: dealItemSchema },
    risks: { type: "array", items: { type: "string" } },
    nextSteps: { type: "array", items: { type: "string" } }
  },
  required: [
    "summary", "recommendation", "confidence", "estimatedRetailGbp",
    "estimatedTradeGbp", "maxCashBuyGbp", "suggestedConsignmentAskGbp",
    "items", "risks", "nextSteps"
  ]
};

function configFor(kind) {
  if (kind === "listing") {
    return {
      name: "AO Listing Agent",
      instructions: listingInstructions,
      schema: listingSchema,
      outputContract: listingOutputContract,
      model: "gpt-5.6-luna",
      webContext: "low",
      reasoningEffort: "none",
    };
  }
  return {
    name: "AO Deal Analyst",
    instructions: dealInstructions,
    schema: dealSchema,
    outputContract: JSON.stringify(dealSchema),
    model: "gpt-5.6-terra",
    webContext: "medium",
    reasoningEffort: "medium",
  };
}

function parseJsonText(text) {
  const source = clean(text, 50000)
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/i, "");
  try {
    return JSON.parse(source);
  } catch {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(source.slice(start, end + 1)); } catch {}
    }
  }
  return null;
}

function isCompleteListingResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    typeof value.partNumber === "string" &&
    typeof value.listingTitle === "string" &&
    typeof value.ebayTitle === "string" &&
    typeof value.description === "string" &&
    typeof value.recommendedPriceGbp === "number" &&
    typeof value.priceLowGbp === "number" &&
    typeof value.priceHighGbp === "number" &&
    typeof value.pricingConfidence === "string" &&
    Array.isArray(value.marketEvidence) &&
    Array.isArray(value.seoKeywords) &&
    Array.isArray(value.checks)
  );
}

function isCompleteDealResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    typeof value.summary === "string" &&
    typeof value.recommendation === "string" &&
    typeof value.estimatedRetailGbp === "number" &&
    typeof value.estimatedTradeGbp === "number" &&
    typeof value.maxCashBuyGbp === "number" &&
    Array.isArray(value.items) &&
    Array.isArray(value.risks) &&
    Array.isArray(value.nextSteps)
  );
}

function isCompleteResult(value) {
  return isCompleteListingResult(value) || isCompleteDealResult(value);
}

function extractStructuredResult(items) {
  const seen = new Set();

  function visit(value, depth = 0) {
    if (value == null || depth > 8) return null;

    if (typeof value === "string") {
      const parsed = parseJsonText(value);
      return isCompleteResult(parsed) ? parsed : null;
    }

    if (typeof value !== "object") return null;
    if (seen.has(value)) return null;
    seen.add(value);

    if (isCompleteResult(value)) return value;

    const preferredKeys = [
      "parsed", "json", "value", "text", "output_text",
      "content", "output", "result", "data"
    ];

    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const found = visit(value[key], depth + 1);
        if (found) return found;
      }
    }

    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i -= 1) {
        const found = visit(value[i], depth + 1);
        if (found) return found;
      }
      return null;
    }

    for (const nested of Object.values(value)) {
      const found = visit(nested, depth + 1);
      if (found) return found;
    }

    return null;
  }

  const all = Array.isArray(items) ? items : [];
  const assistantMessages = all.filter((item) =>
    item?.type === "message" &&
    item?.role === "assistant" &&
    item?.status !== "failed"
  );

  const finals = assistantMessages.filter((item) => item?.phase === "final");
  const ordered = [
    ...finals.slice().reverse(),
    ...assistantMessages
      .filter((item) => item?.phase !== "final")
      .slice()
      .reverse()
  ];

  for (const item of ordered) {
    const found = visit(item.content || item);
    if (found) return found;
  }

  return null;
}

function describeAgentItems(items) {
  const all = Array.isArray(items) ? items : [];
  return all.slice(-12).map((item) => {
    const parts = Array.isArray(item?.content) ? item.content : [];
    const contentTypes = parts.map((part) => part?.type || typeof part).join(",");
    const textPreview = parts
      .map((part) => {
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.output_text === "string") return part.output_text;
        if (typeof part?.value === "string") return part.value;
        return "";
      })
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 180);

    return [
      item?.type || "?",
      item?.role || "-",
      item?.phase || "-",
      item?.status || "-",
      contentTypes || "no-content",
      textPreview ? `text=${textPreview}` : ""
    ].filter(Boolean).join("/");
  }).join(" | ");
}

async function startAgent(request, response) {
  const body = request.body || {};
  const kind = clean(body.kind, 30);
  if (!ALLOWED_KINDS.has(kind)) {
    return json(response, 400, { error: "Unknown agent type" });
  }

  const input = body.input && typeof body.input === "object" ? body.input : {};
  const cfg = configFor(kind);
  const cache = kind === "listing" ? await readListingCache(input) : { key: "", hit: false };
  const cacheContext = cache.hit
    ? `\nCACHED_RESEARCH (fresh, do not web-search or invent replacements):${JSON.stringify(cache.research)}\nUse these exact market references as marketEvidence. You may adjust wording/checks for the user's current notes, but keep pricing grounded in this cached evidence.`
    : "";
  const task = `INPUT:${JSON.stringify(input)}${cacheContext}\n${cfg.outputContract}\nNo markdown or commentary.`;
  const tools = cache.hit ? [] : [{
    type: "web_search",
    mode: "live",
    context_size: cfg.webContext,
    location: { country: "GB", timezone: "Europe/London" }
  }];
  const instructions = cache.hit
    ? cfg.instructions + "\nCached market research is supplied in the user input. Do not use web search. Do not invent newer sources or prices."
    : cfg.instructions;

  const session = await openai("/agents/sessions", {
    method: "POST",
    body: JSON.stringify({
      environment: { type: "none" },
      agent: {
        model: cfg.model,
        instructions,
        tools,
        multi_agent: { enabled: false },
        reasoning: { effort: cfg.reasoningEffort },
        text: {
          verbosity: "low",
          format: { type: "text" }
        }
      },
      metadata: {
        app: "automation-outlet",
        kind,
        model: cfg.model,
        cache: cache.hit ? "hit" : "miss",
        cacheKey: cache.key || "",
        cacheAgeHours: cache.hit && cache.ageHours !== null ? String(cache.ageHours) : ""
      }
    }),
  });

  await openai(`/agents/sessions/${encodeURIComponent(session.id)}/events`, {
    method: "POST",
    body: JSON.stringify({
      events: [{
        type: "agent.session.input.message",
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: task
          }]
        }]
      }]
    }),
  });

  return json(response, 202, {
    sessionId: session.id,
    status: "in_progress",
    kind,
  });
}

async function getAgentStatus(request, response) {
  const id = sessionId(request.query?.sessionId);
  if (!id) return json(response, 400, { error: "Valid sessionId is required" });

  const session = await openai(`/agents/sessions/${encodeURIComponent(id)}`);
  const base = {
    sessionId: id,
    status: session.status,
    error: session.error || null,
    usage: session.usage || null,
    model: session?.metadata?.model || null,
    cache: session?.metadata?.cache || null,
    cacheAgeHours: session?.metadata?.cacheAgeHours === "" ? null : Number(session?.metadata?.cacheAgeHours),
  };

  if (session.status === "failed") {
    return json(response, 200, {
      ...base,
      status: "failed",
      error: session.error || "Agent session failed."
    });
  }

  if (session.status === "requires_action") {
    return json(response, 200, base);
  }

  const turnsPage = await openai(`/agents/sessions/${encodeURIComponent(id)}/turns?limit=20&order=desc`);
  const turns = Array.isArray(turnsPage.data) ? turnsPage.data : [];
  const rootTurn = turns.find((turn) => !turn?.subagent_id) || turns[0] || null;

  // Agents API token usage is best effort. The list-turns response can omit
  // usage, so first use any session/list usage we have. Once the root turn is
  // terminal, retrieve that exact turn as a second chance for the canonical
  // detailed usage payload.
  if (!base.usage && rootTurn?.usage) {
    base.usage = rootTurn.usage;
  }

  if (!rootTurn || ["queued", "in_progress", "waiting"].includes(rootTurn.status)) {
    return json(response, 200, {
      ...base,
      status: "in_progress",
      turnStatus: rootTurn?.status || "queued"
    });
  }

  let detailedTurn = rootTurn;
  if (!base.usage && rootTurn?.id) {
    try {
      detailedTurn = await openai(
        `/agents/sessions/${encodeURIComponent(id)}/turns/${encodeURIComponent(rootTurn.id)}`
      );
      if (detailedTurn?.usage) base.usage = detailedTurn.usage;
    } catch (error) {
      console.warn("AO turn usage retrieve failed", error.message);
    }
  }

  if (detailedTurn.status === "failed" || detailedTurn.status === "cancelled") {
    return json(response, 200, {
      ...base,
      status: "failed",
      error: detailedTurn.error?.message || detailedTurn.error?.code || `Agent turn ${detailedTurn.status}.`
    });
  }

  const page = await openai(`/agents/sessions/${encodeURIComponent(id)}/items?limit=100&order=asc`);
  const result = extractStructuredResult(page.data || []);

  if (!result) {
    return json(response, 200, {
      ...base,
      status: "failed",
      error: `Agent turn completed but the result could not be read. Debug: turn=${detailedTurn.status}; ${describeAgentItems(page.data || [])}`,
    });
  }

  if (session?.metadata?.kind === "listing" && session?.metadata?.cache === "miss") {
    await writeListingCache(session?.metadata?.cacheKey || "", result);
  }

  return json(response, 200, { ...base, status: "idle", result });
}

export default async function handler(request, response) {
  try {
    if (!requireAdmin(request)) {
      return json(response, 401, { error: "Invalid Automation Outlet admin key" });
    }

    if (request.method === "GET" && String(request.query?.health || "") === "1") {
      return json(response, 200, {
        ok: true,
        configured: Boolean(process.env.OPENAI_API_KEY),
        listingModel: "gpt-5.6-luna",
        dealModel: "gpt-5.6-terra",
        listingCache: Boolean(process.env.AO_GITHUB_TOKEN),
        listingCacheTtlDays: 7,
      });
    }

    if (request.method === "GET") return await getAgentStatus(request, response);
    if (request.method === "POST") return await startAgent(request, response);

    response.setHeader("Allow", "GET, POST");
    return json(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("AO Agents API error", error);
    return json(response, error.status || 500, {
      error: error.status ? error.message : "Unexpected agent error",
    });
  }
}
