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
- Keep research efficient: normally no more than 5 web searches.
- Prefer manufacturer documentation and credible industrial automation resellers. Marketplaces can be used as supporting price signals.
- Never invent specifications, condition, test status, packaging or compatibility. If evidence is weak, put the uncertainty in checks.
- Prices must be in GBP and should be realistic achievable resale prices, not optimistic asking prices.
- eBay title must be 80 characters or fewer. Website title must be 180 characters or fewer.
- Description must be concise, professional, plain text, and suitable for Automation Outlet and eBay.
- Default website status to draft and deliveryMode to quote.
- Use one of these categories where possible: PLC CPU, PLC I/O module, Communication module, HMI, Drive / inverter, Safety module, Power supply, Industrial PC, Sensor, Motor starter, Other automation.
- Preserve the user's stated condition exactly where it maps cleanly to Automation Outlet wording.
Return ONLY valid JSON and no markdown with exactly this shape:
{
  "partNumber": "",
  "brand": "",
  "identification": "",
  "category": "",
  "condition": "",
  "quantity": 1,
  "listingTitle": "",
  "ebayTitle": "",
  "description": "",
  "recommendedPriceGbp": 0,
  "priceLowGbp": 0,
  "priceHighGbp": 0,
  "deliveryMode": "quote",
  "status": "draft",
  "seoKeywords": [],
  "checks": [],
  "pricingNotes": ""
}
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
Return ONLY valid JSON and no markdown with exactly this shape:
{
  "summary": "",
  "recommendation": "buy|consignment|broker|more-info|pass",
  "confidence": "high|medium|low",
  "estimatedRetailGbp": 0,
  "estimatedTradeGbp": 0,
  "maxCashBuyGbp": 0,
  "suggestedConsignmentAskGbp": 0,
  "items": [
    {
      "partNumber": "",
      "identification": "",
      "quantity": 1,
      "realisticSaleGbpEach": 0,
      "tradeValueGbpEach": 0,
      "maxBuyGbpEach": 0,
      "notes": ""
    }
  ],
  "risks": [],
  "nextSteps": []
}
`;

function configFor(kind) {
  if (kind === "listing") {
    return {
      name: "AO Listing Agent",
      instructions: listingInstructions,
      reasoning: { effort: "medium", summary: "none" },
    };
  }
  return {
    name: "AO Deal Analyst",
    instructions: dealInstructions,
    reasoning: { effort: "medium", summary: "none" },
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

function extractAssistantText(items) {
  const messages = (items || []).filter((item) =>
    item?.type === "message" && item?.role === "assistant" && Array.isArray(item.content)
  );
  const preferred = messages.filter((item) => item.phase === "final");
  const source = preferred.length ? preferred : messages;
  const message = source[source.length - 1];
  if (!message) return "";
  return message.content
    .map((part) => typeof part?.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function startAgent(request, response) {
  const body = request.body || {};
  const kind = clean(body.kind, 30);
  if (!ALLOWED_KINDS.has(kind)) {
    return json(response, 400, { error: "Unknown agent type" });
  }

  const input = body.input && typeof body.input === "object" ? body.input : {};
  const cfg = configFor(kind);
  const task = `Automation Outlet task input:\n${JSON.stringify(input, null, 2)}\n\nComplete the task and return only the requested JSON object.`;

  const session = await openai("/agents/sessions", {
    method: "POST",
    body: JSON.stringify({
      environment: { type: "none" },
      agent: {
        model: "gpt-5.6-terra",
        name: cfg.name,
        instructions: cfg.instructions,
        tools: [{ type: "web_search" }],
        multi_agent: { enabled: false, max_concurrent_subagents: 1 },
        reasoning: cfg.reasoning,
        text: { verbosity: "low" }
      },
      input: task,
      metadata: {
        app: "automation-outlet",
        kind
      }
    }),
  });

  return json(response, 202, {
    sessionId: session.id,
    status: session.status,
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

  if (session.status !== "idle") {
    return json(response, 200, base);
  }

  const page = await openai(`/agents/sessions/${encodeURIComponent(id)}/items?limit=100&order=asc`);
  const text = extractAssistantText(page.data || []);
  const result = parseJsonText(text);

  if (!result) {
    return json(response, 200, {
      ...base,
      status: "failed",
      error: "Agent completed but the structured result could not be read.",
    });
  }

  return json(response, 200, { ...base, result });
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
