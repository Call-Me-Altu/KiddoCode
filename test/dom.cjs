// Optional QA dependency: npm install --no-save jsdom; node test/dom.cjs
const { JSDOM } = require(process.env.JSDOM_MODULE || "jsdom");
const { webcrypto } = require("node:crypto");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const wait = () => new Promise((r) => setTimeout(r, 35));
function setup(file, fetch) {
  const dom = new JSDOM(fs.readFileSync("public/" + file, "utf8"), {
    url: "https://kiddcode.netlify.app/" + file,
    runScripts: "outside-only",
  });
  const w = dom.window;
  w.fetch = fetch;
  w.AbortSignal = AbortSignal;
  w.TextEncoder = TextEncoder;
  Object.defineProperty(w, "crypto", { value: webcrypto });
  w.eval(fs.readFileSync("public/script.js", "utf8"));
  return dom;
}
(async () => {
  // Static link and form-label checks across every page.
  for (const file of fs
    .readdirSync("public")
    .filter((p) => p.endsWith(".html"))) {
    const dom = new JSDOM(fs.readFileSync("public/" + file, "utf8"));
    const d = dom.window.document;
    const ids = [...d.querySelectorAll("[id]")].map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, file + " duplicate ids");
    for (const input of d.querySelectorAll("input,select"))
      assert.ok(input.labels.length, file + " unlabelled field");
    for (const a of d.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href");
      if (/^(https?:|mailto:|tel:)/.test(href)) continue;
      const [target, anchor] = href.split("#");
      const dest = target || file;
      assert.ok(fs.existsSync("public/" + dest), file + " missing " + href);
      if (anchor) {
        const doc =
          dest === file
            ? d
            : new JSDOM(fs.readFileSync("public/" + dest, "utf8")).window
                .document;
        assert.ok(doc.getElementById(anchor), file + " missing anchor " + href);
      }
    }
    dom.window.close();
  }
  let calls = [];
  const dom = setup("index.html", async (url, options) => {
    calls.push(options);
    return {
      ok: calls.length > 1,
      json: async () =>
        calls.length === 1
          ? { message: "Database temporarily unavailable" }
          : { success: true, id: "saved-reference" },
    };
  });
  const w = dom.window,
    d = w.document,
    form = d.querySelector("form");
  d.querySelector(".menu-button").click();
  assert.equal(
    d.querySelector(".menu-button").getAttribute("aria-expanded"),
    "true",
  );
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(
    d.querySelector(".menu-button").getAttribute("aria-expanded"),
    "false",
  );
  d.querySelector('[data-course="Java Programming"]').click();
  assert.equal(form.elements.course.value, "Java Programming");
  for (const [k, v] of Object.entries({
    name: "Parent Name",
    email: "parent@example.com",
    phone: "+919876543210",
    age: "10–13",
    date: "2026-12-01",
    time: "16:00",
  }))
    form.elements[k].value = v;
  form.elements.consent.checked = true;
  const submit = () =>
    form.dispatchEvent(new w.Event("submit", { cancelable: true }));
  submit();
  submit();
  await wait();
  assert.equal(calls.length, 1, "double click should send once");
  assert.ok(
    d
      .querySelector(".form-message")
      .textContent.includes("Database temporarily"),
  );
  assert.equal(form.elements.name.value, "Parent Name");
  submit();
  await wait();
  assert.equal(calls.length, 2);
  assert.equal(
    calls[0].headers["Idempotency-Key"],
    calls[1].headers["Idempotency-Key"],
  );
  assert.equal(d.getElementById("booking-success").hidden, false);
  assert.ok(
    d.getElementById("booking-whatsapp").href.includes("saved-reference"),
  );
  assert.ok(
    !w.sessionStorage.getItem("kiddo-request").includes("parent@example.com"),
  );
  dom.window.close();
  for (const mode of ["signup", "forgot", "reset"]) {
    let requests = [];
    const dom = setup(mode + ".html", async (url, options) => {
      if (url === "/api/config")
        return {
          ok: true,
          json: async () => ({
            supabaseUrl: "https://project.supabase.co",
            supabaseKey: "public-key",
          }),
        };
      requests.push({ url, options });
      return { ok: true, json: async () => ({}) };
    });
    const w = dom.window;
    if (mode === "reset")
      w.sessionStorage.setItem(
        "kiddo-session",
        JSON.stringify({
          access_token: "test-token",
          refresh_token: "refresh",
          expires_at: Date.now() + 3600000,
        }),
      );
    w.eval(fs.readFileSync("public/account.js", "utf8"));
    await wait();
    const f = w.document.getElementById("auth-form");
    if (f.elements.email) f.elements.email.value = "parent@example.com";
    if (f.elements.password)
      f.elements.password.value = "a-long-test-passphrase";
    if (f.elements.adult) f.elements.adult.checked = true;
    f.dispatchEvent(new w.Event("submit", { cancelable: true }));
    await wait();
    assert.ok(requests.length);
    assert.ok(
      w.document
        .querySelector(".form-message")
        .textContent.includes(
          mode === "signup"
            ? "Check your email"
            : mode === "forgot"
              ? "If an account exists"
              : "Password updated",
        ),
    );
    if (mode === "reset")
      assert.equal(w.sessionStorage.getItem("kiddo-session"), null);
    dom.window.close();
  }
  const account = setup("dashboard.html", async (url, options) => {
    if (url === "/api/config")
      return {
        ok: true,
        json: async () => ({
          supabaseUrl: "https://project.supabase.co",
          supabaseKey: "public-key",
        }),
      };
    return {
      ok: true,
      json: async () => ({
        admin: false,
        rows: [
          {
            id: "test",
            name: "<img src=x onerror=alert(1)>",
            email: "parent@example.com",
            age: "10–13",
            course: "Python Programming",
            date: "2026-12-01",
            time: "16:00",
            timezone: "Asia/Kolkata",
            status: "New",
          },
        ],
        hasMore: false,
      }),
    };
  });
  account.window.sessionStorage.setItem(
    "kiddo-session",
    JSON.stringify({
      access_token: "token",
      refresh_token: "refresh",
      expires_at: Date.now() + 3600000,
    }),
  );
  account.window.eval(fs.readFileSync("public/account.js", "utf8"));
  await wait();
  await wait();
  assert.equal(
    account.window.document.querySelectorAll(".lead-item img").length,
    0,
  );
  assert.ok(
    account.window.document
      .querySelector(".lead-item")
      .textContent.includes("<img"),
  );
  account.window.document.getElementById("lead-search").value = "no-match";
  account.window.document
    .getElementById("lead-search")
    .dispatchEvent(new account.window.Event("input"));
  assert.ok(
    account.window.document
      .getElementById("lead-list")
      .textContent.includes("No requests match"),
  );
  account.window.close();
  console.log(
    "PASS: links/anchors/labels/IDs on 8 pages; menu; course selection; double-submit prevention; failed-request preservation; stable retry key; booking success; WhatsApp link; signup, recovery, password reset; dashboard filtering and safe text rendering.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
