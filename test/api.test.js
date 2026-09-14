const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createApp } = require("../server");
const { validateBooking } = require("../validation");
const payload = () => ({
  name: "Test Parent",
  email: "parent@example.com",
  phone: "+919876543210",
  age: "10–13",
  course: "Python Programming",
  date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
  time: "16:00",
  timezone: "Asia/Kolkata",
  consent: true,
  website: "",
});
async function serve(t, deps) {
  const server = createApp(deps).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  return "http://127.0.0.1:" + server.address().port;
}
test("valid booking is normalized; only necessary fields survive", () => {
  const b = validateBooking({
    ...payload(),
    email: " PARENT@example.com ",
    extra: "discard",
  });
  assert.equal(b.email, "parent@example.com");
  assert.equal(b.extra, undefined);
});
for (const [name, change] of Object.entries({
  consent: { consent: false },
  email: { email: "bad" },
  phone: { phone: "9876543210" },
  course: { course: "unknown" },
  timezone: { timezone: "Fake/Zone" },
  past: { date: "2020-01-01" },
  calendar: { date: "2027-02-30" },
  time: { time: "25:01" },
  bot: { website: "spam" },
  age: { age: "99" },
  name: { name: "X" },
})) {
  test("rejects invalid " + name, () =>
    assert.throws(() => validateBooking({ ...payload(), ...change })),
  );
}
test("success waits for database commit, not email delivery", async (t) => {
  let saved = false;
  const url = await serve(t, {
    db: async (path, { body }) => {
      assert.equal(path, "rpc/save_booking");
      assert.equal(body.p_data.email, "parent@example.com");
      await new Promise((r) => setTimeout(r, 30));
      saved = true;
      return "booking-ref";
    },
  });
  const r = await fetch(url + "/api/bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(payload()),
  });
  assert.equal(r.status, 201);
  assert.ok(saved);
  assert.equal((await r.json()).id, "booking-ref");
});
test("database failures never show booking success", async (t) => {
  const url = await serve(t, {
    db: async () => {
      throw Error();
    },
  });
  const r = await fetch(url + "/api/bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(payload()),
  });
  assert.equal(r.status, 503);
});
test("invalid retry key fails before database", async (t) => {
  const url = await serve(t, { db: () => assert.fail() });
  const r = await fetch(url + "/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload()),
  });
  assert.equal(r.status, 400);
});
test("retry key conflict is explicit", async (t) => {
  const url = await serve(t, {
    db: async () => {
      throw Object.assign(Error(), { code: "23505" });
    },
  });
  const r = await fetch(url + "/api/bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(payload()),
  });
  assert.equal(r.status, 409);
});
test("anonymous callers cannot read account leads", async (t) => {
  const url = await serve(t, {
    authenticate: async () => {
      throw Error();
    },
    db: () => assert.fail(),
  });
  assert.equal((await fetch(url + "/api/account/bookings")).status, 401);
});
test("unverified users cannot read account leads", async (t) => {
  const url = await serve(t, {
    authenticate: async () => ({ id: "x", email: "p@example.com" }),
    db: () => assert.fail(),
  });
  assert.equal((await fetch(url + "/api/account/bookings")).status, 401);
});
test("parent queries are restricted to verified email and status writes forbidden", async (t) => {
  const url = await serve(t, {
    authenticate: async () => ({
      id: "parent",
      email: "PARENT@example.com",
      email_confirmed_at: "now",
    }),
    db: async (path) => {
      assert.ok(path.includes("&email=eq.parent%40example.com"));
      return [];
    },
  });
  const r = await fetch(url + "/api/account/bookings");
  assert.equal((await r.json()).admin, false);
  assert.equal(
    (
      await fetch(url + "/api/account/bookings/" + randomUUID(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Converted" }),
      })
    ).status,
    403,
  );
});
test("admin can update an existing booking, never arbitrary fields", async (t) => {
  process.env.ADMIN_USER_IDS = "admin";
  t.after(() => delete process.env.ADMIN_USER_IDS);
  const url = await serve(t, {
    authenticate: async () => ({ id: "admin", email_confirmed_at: "now" }),
    db: async (path, { body }) => {
      assert.deepEqual(body, { status: "Contacted" });
      return [{ id: "test" }];
    },
  });
  const r = await fetch(url + "/api/account/bookings/" + randomUUID(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "Contacted",
      email: "overwrite@example.com",
    }),
  });
  assert.equal(r.status, 200);
});
test("public config never exposes service keys", async (t) => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "secret-test";
  t.after(() => delete process.env.SUPABASE_SERVICE_ROLE_KEY);
  const url = await serve(t, {});
  assert.ok(
    !(await (await fetch(url + "/api/config")).text()).includes("secret-test"),
  );
});
test("static assets do not expose backend or env files", async (t) => {
  const url = await serve(t, {});
  for (const p of ["/.env", "/server.js", "/schema.sql", "/package.json"])
    assert.equal((await fetch(url + p)).status, 404);
});

