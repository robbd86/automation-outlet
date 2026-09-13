import crypto from "node:crypto";

const OPENAI_BASE = "https://api.openai.com/v1";
const ALLOWED_KINDS = new Set(["listing", "deal"]);

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

async function openai(path, options = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const error = new Error("OpenAI API key is not configured");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${OPENAI_BASE}${path}`, {
    ...options,
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
}

const listingInstructions = `
You are the Automation Outlet Listing Agent for a UK industrial automation reseller.
Your job is to turn sparse part information into a commercially useful, accurate listing draft.

Rules:
- Use web search when it materially improves identification, specifications or current market pricing.
- Keep research efficient: use no more than 3 focused web searches for a normal listing. Stop once you have enough evidence to identify the exact part and set a realistic price.
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
    identification: { type: "string" },
    category: { type: "string" },
    condition: { type: "string" },
    quantity: { type: "integer", minimum: 1 },
    listingTitle: { type: "string" },
    ebayTitle: { type: "string" },
    description: { type: "string" },
    recommendedPriceGbp: { type: "number", minimum: 0 },
    priceLowGbp: { type: "number", minimum: 0 },
    priceHighGbp: { type: "number", minimum: 0 },
    deliveryMode: { type: "string", enum: ["quote", "parcel"] },
    status: { type: "string", enum: ["draft"] },
    seoKeywords: { type: "array", items: { type: "string" } },
    checks: { type: "array", items: { type: "string" } },
    pricingNotes: { type: "string" }
  },
  required: [
    "partNumber", "brand", "identification", "category", "condition", "quantity",
    "listingTitle", "ebayTitle", "description", "recommendedPriceGbp",
    "priceLowGbp", "priceHighGbp", "deliveryMode", "status",
    "seoKeywords", "checks", "pricingNotes"
  ]
};

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
    };
  }
  return {
    name: "AO Deal Analyst",
    instructions: dealInstructions,
    schema: dealSchema,
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
  const task = `Automation Outlet task input:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY one valid JSON object matching this JSON Schema exactly. Do not use markdown or commentary.\n\nJSON Schema:\n${JSON.stringify(cfg.schema, null, 2)}`;

  const session = await openai("/agents/sessions", {
    method: "POST",
    body: JSON.stringify({
      environment: { type: "none" },
      agent: {
        model: "gpt-5.6-terra",
        instructions: cfg.instructions,
        tools: [{
          type: "web_search",
          mode: "live",
          context_size: "medium",
          location: { country: "GB", timezone: "Europe/London" }
        }],
        multi_agent: { enabled: false },
        reasoning: { effort: kind === "listing" ? "low" : "medium" },
        text: {
          verbosity: "low",
          format: { type: "text" }
        }
      },
      metadata: {
        app: "automation-outlet",
        kind
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

  if (!rootTurn || ["queued", "in_progress", "waiting"].includes(rootTurn.status)) {
    return json(response, 200, {
      ...base,
      status: "in_progress",
      turnStatus: rootTurn?.status || "queued"
    });
  }

  if (rootTurn.status === "failed" || rootTurn.status === "cancelled") {
    return json(response, 200, {
      ...base,
      status: "failed",
      error: rootTurn.error?.message || rootTurn.error?.code || `Agent turn ${rootTurn.status}.`
    });
  }

  const page = await openai(`/agents/sessions/${encodeURIComponent(id)}/items?limit=100&order=asc`);
  const result = extractStructuredResult(page.data || []);

  if (!result) {
    return json(response, 200, {
      ...base,
      status: "failed",
      error: `Agent turn completed but the result could not be read. Debug: turn=${rootTurn.status}; ${describeAgentItems(page.data || [])}`,
    });
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
        model: "gpt-5.6-terra",
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
