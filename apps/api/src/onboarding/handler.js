import { createOnboardingRepository, createOnboardingService } from "../../../../packages/onboarding-journey/src/index.js";
import { baseResponseHeaders } from "../http/headers.js";

// Shared in-memory repository for the staged/dev runtime; production injects the
// PostgreSQL adapter via runtime-repositories.js.
export const sharedOnboardingRepository = createOnboardingRepository();
const response = (status, body, headers = {}) => ({ status, headers: baseResponseHeaders({ "content-type": "application/json", ...headers }), body });
const parse = (body) => (typeof body === "string" ? JSON.parse(body) : body ?? {});

export async function handleOnboardingRequest({ method, path, body, principal, onboardingRepository = sharedOnboardingRepository }) {
  const url = new URL(path, "http://internal");
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
  const isOnboardingRoute = parts[0] === "v1" && parts[1] === "onboarding" && parts[2] === "journeys";
  if (!isOnboardingRoute) return null;
  if (!principal?.authenticated) return response(401, { error: "unauthorized", message: "Authenticated session required." });

  const service = createOnboardingService({ repository: onboardingRepository });
  try {
    if (method === "POST" && parts.length === 3) {
      return response(201, { item: service.start(principal, parse(body)) });
    }
    const journeyId = parts[3];
    if (method === "GET" && parts.length === 4) {
      return response(200, { item: service.get(principal, journeyId) });
    }
    if (method === "POST" && parts.length === 5 && parts[4] === "advance") {
      const { event, payload, eventId } = parse(body);
      return response(200, { item: service.advance(principal, journeyId, event, payload ?? {}, { eventId }) }, { "cache-control": "no-store" });
    }
    return response(404, { error: "not_found", message: "Onboarding route not found." });
  } catch (error) {
    return response(
      error.status ?? 500,
      {
        error: error.code ?? (error.status === 403 ? "forbidden" : error.status === 401 ? "unauthorized" : error.status === 404 ? "not_found" : "request_failed"),
        message: error.status ? error.message : "Onboarding request failed safely."
      }
    );
  }
}
