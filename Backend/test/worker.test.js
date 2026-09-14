const { test } = require("node:test");
const assert = require("node:assert/strict");
const { send } = require("../worker");
test("email uses safe plain text and a stable idempotency key", async (t) => {
  const original = global.fetch;
  const env = { ...process.env };
  t.after(() => {
    global.fetch = original;
    process.env = env;
  });
  Object.assign(process.env, {
    RESEND_API_KEY: "test",
    EMAIL_FROM: "test@example.com",
    OWNER_EMAIL: "owner@example.com",
  });
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.headers["Idempotency-Key"], "notification-123");
    const data = JSON.parse(options.body);
    assert.equal(data.html, undefined);
    assert.ok(data.text.includes("not a confirmed appointment"));
    return { ok: true };
  };
  await send(
    { id: "123", channel: "parent_email" },
    {
      id: "ref",
      name: "<img src=x>",
      email: "parent@example.com",
      course: "Python",
      date: "2026-10-01",
      time: "14:00",
      timezone: "Asia/Kolkata",
    },
  );
});
test("provider rejection triggers retry path", async (t) => {
  const original = global.fetch;
  t.after(() => (global.fetch = original));
  global.fetch = async () => ({ ok: false });
  process.env.RESEND_API_KEY = "test";
  process.env.EMAIL_FROM = "test@example.com";
  process.env.OWNER_EMAIL = "owner@example.com";
  await assert.rejects(() =>
    send({ id: "123", channel: "parent_email" }, { name: "Parent" }),
  );
});
