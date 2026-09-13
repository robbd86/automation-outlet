import dealDeskHandler from "../lib/deal-desk-handler.mjs";
import agentsHandler from "../lib/agents-handler.mjs";

function isAgentRequest(request) {
  const query = request.query || {};
  const body = request.body || {};

  if (request.method === "GET") {
    return String(query.health || "") === "1" || Boolean(query.sessionId);
  }

  if (request.method === "POST") {
    return body && (body.kind === "listing" || body.kind === "deal");
  }

  return false;
}

export default async function handler(request, response) {
  if (isAgentRequest(request)) {
    return agentsHandler(request, response);
  }

  return dealDeskHandler(request, response);
}
