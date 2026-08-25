import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSubmission } from "../../../api/contact.js";

test("contact API normalizes a valid submission", () => {
  const submission = normalizeSubmission({
    subject: "Xygo Contact Inquiry",
    website: "",
    fields: {
      "Full name": "Ada Lovelace",
      "Work email": "ada@example.com",
      Message: "Please contact me."
    }
  });

  assert.equal(submission.blocked, false);
  assert.equal(submission.replyTo, "ada@example.com");
  assert.match(submission.text, /Full name: Ada Lovelace/);
});

test("contact API accepts honeypot submissions without sending", () => {
  assert.deepEqual(normalizeSubmission({ website: "bot.example", fields: {} }), { blocked: true });
});

test("contact API rejects submissions without a valid reply email", () => {
  assert.throws(() => normalizeSubmission({ website: "", fields: { Message: "Hello" } }));
});
