// Optional: npm install --no-save @electric-sql/pglite; node test/database.cjs
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const fs = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  await db.exec(fs.readFileSync("schema.sql", "utf8"));
  const data = {
    name: "Parent",
    email: "parent@example.com",
    phone: "+919876543210",
    age: "10–13",
    course: "Python Programming",
    date: "2026-12-01",
    time: "15:00",
    timezone: "Asia/Kolkata",
    consent: true,
  };
  const key = "00000000-0000-4000-8000-000000000001";
  const save = () =>
    db.query("select save_booking($1,$2,$3,$4) as id", [
      key,
      "hash",
      JSON.stringify(data),
      true,
    ]);
  const first = (await save()).rows[0].id;
  assert.equal((await save()).rows[0].id, first);
  assert.equal(
    (await db.query("select count(*)::int n from bookings")).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select count(*)::int n from notifications")).rows[0].n,
    3,
  );
  await assert.rejects(() =>
    db.query("select save_booking($1,$2,$3,$4)", [
      key,
      "different",
      JSON.stringify(data),
      false,
    ]),
  );
  const jobs = (await db.query("select * from claim_notifications()")).rows;
  assert.equal(jobs.length, 3);
  assert.ok(jobs.every((j) => j.attempts === 1 && j.lease_token));
  assert.equal(
    (await db.query("select * from claim_notifications()")).rows.length,
    0,
  );
  await db.exec(
    "update notifications set available_at=now()-interval '1 second';",
  );
  const retry = (await db.query("select * from claim_notifications()")).rows;
  assert.ok(retry.every((j) => j.attempts === 2));
  assert.notEqual(retry[0].lease_token, jobs[0].lease_token);
  await db.exec(
    "update notifications set attempts=6,available_at=now()-interval '1 second';",
  );
  assert.equal(
    (await db.query("select * from claim_notifications()")).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from notifications where state='failed'",
      )
    ).rows[0].n,
    3,
  );
  await db.exec("set role anon;");
  await assert.rejects(() => db.query("select * from bookings"));
  await assert.rejects(save);
  await db.exec("reset role; set role authenticated;");
  await assert.rejects(() => db.query("select * from bookings"));
  await assert.rejects(() => db.query("select * from claim_notifications()"));
  await db.close();
  console.log(
    "PASS: real PostgreSQL schema, atomic insert, duplicate retry, payload conflict, notification lease/reclaim/exhaustion, anon and authenticated permissions.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
