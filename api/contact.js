const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DESTINATION_EMAIL = "xagent@xygo.pro";
const DEFAULT_FROM_EMAIL = "Xygo Website <forms@xygo.pro>";
const MAX_FIELD_LENGTH = 4000;
const MAX_FIELDS = 24;

function clean(value, maxLength = MAX_FIELD_LENGTH) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizeSubmission(body) {
  const input = typeof body === "string" ? JSON.parse(body) : body;

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid submission.");
  }

  const website = clean(input.website, 200);
  if (website) {
    return { blocked: true };
  }

  const subject = clean(input.subject, 160) || "Xygo website inquiry";
  const fields = Object.entries(input.fields ?? {})
    .slice(0, MAX_FIELDS)
    .map(([key, value]) => [clean(key, 100), clean(value)])
    .filter(([key, value]) => key && value);
  const replyTo = fields.find(([key]) => /email/i.test(key))?.[1] ?? "";

  if (fields.length === 0 || !/^\S+@\S+\.\S+$/.test(replyTo)) {
    throw new Error("A valid email and form details are required.");
  }

  return {
    blocked: false,
    subject,
    replyTo,
    text: fields.map(([key, value]) => `${key}: ${value}`).join("\n\n")
  };
}

function respond(response, status, payload) {
  response.status(status).json(payload);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return respond(response, 405, { ok: false, error: "Method not allowed." });
  }

  if (!process.env.RESEND_API_KEY) {
    return respond(response, 503, { ok: false, error: "Email service is not configured." });
  }

  let submission;
  try {
    submission = normalizeSubmission(request.body);
  } catch {
    return respond(response, 400, { ok: false, error: "Please check the form and try again." });
  }

  if (submission.blocked) {
    return respond(response, 200, { ok: true });
  }

  try {
    const resendResponse = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL,
        to: [DESTINATION_EMAIL],
        reply_to: submission.replyTo,
        subject: submission.subject,
        text: submission.text
      })
    });

    if (!resendResponse.ok) {
      return respond(response, 502, { ok: false, error: "Email delivery failed. Please try again." });
    }

    return respond(response, 200, { ok: true });
  } catch {
    return respond(response, 502, { ok: false, error: "Email delivery failed. Please try again." });
  }
}
