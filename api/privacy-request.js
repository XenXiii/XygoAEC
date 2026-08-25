import { encryptedContact, randomId, withDatabase } from "../lib/server/client-data.js";

const ALLOWED = new Set(["do_not_sell_or_share", "access", "deletion", "correction"]);

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, error: "Method not allowed." });
  }

  let body;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  } catch {
    return response.status(400).json({ ok: false, error: "Invalid request body." });
  }
  if (String(body?.website ?? "").trim()) return response.status(200).json({ ok: true });
  const requestType = String(body?.requestType ?? "do_not_sell_or_share");
  if (!ALLOWED.has(requestType)) return response.status(400).json({ ok: false, error: "Invalid privacy request." });

  try {
    const contact = encryptedContact({ email: body?.email, name: body?.name });
    const id = randomId("privacy");
    await withDatabase((client) => client.query(
      "INSERT INTO privacy_requests (id, email_lookup_hash, email_ciphertext, name_ciphertext, request_type) VALUES ($1,$2,$3,$4,$5)",
      [id, contact.emailLookupHash, contact.emailCiphertext, contact.nameCiphertext, requestType]
    ));
    return response.status(202).json({ ok: true, requestId: id, status: "received" });
  } catch (error) {
    if (/valid email/i.test(error.message)) return response.status(400).json({ ok: false, error: error.message });
    return response.status(503).json({ ok: false, error: "Privacy request service is temporarily unavailable." });
  }
}
