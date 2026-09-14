// Optional local QA: npm install --no-save playwright, then npx playwright install chromium.
// Run the application first, then: node test/browser.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      ...(process.env.CHROMIUM_PATH
        ? ["--single-process", "--no-zygote", "--disable-gpu"]
        : []),
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = process.env.TEST_BASE_URL || "http://localhost:3001";
  fs.mkdirSync("test-results", { recursive: true });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "index.html",
      "about.html",
      "privacy.html",
      "login.html",
      "signup.html",
      "forgot.html",
      "reset.html",
    ]) {
      await page.goto(base + "/" + path);
      await page.waitForTimeout(100);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "overflow " + path + " " + width,
      );
    }
    await page.goto(base);
    await page.screenshot({
      path: "test-results/home-" + width + ".png",
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByRole("button", { name: "Menu" }).click();
  assert.equal(await page.locator("#nav-links").isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#nav-links").isVisible(), false);
  await page.locator('[data-course="Web Development"]').click();
  assert.equal(
    await page.locator("[name=course]").inputValue(),
    "Web Development",
  );
  await page.locator("[name=name]").fill("Test Parent");
  await page.locator("[name=email]").fill("parent@example.com");
  await page.locator("[name=phone]").fill("+919876543210");
  await page.locator("[name=age]").selectOption("10–13");
  await page
    .locator("[name=date]")
    .fill(new Date(Date.now() + 172800000).toISOString().slice(0, 10));
  await page.locator("[name=time]").fill("16:00");
  await page.locator("[name=consent]").check();
  let count = 0;
  const keys = [];
  await page.route("**/api/bookings", async (route) => {
    count++;
    keys.push(route.request().headers()["idempotency-key"]);
    await route.fulfill({
      status: count === 1 ? 503 : 201,
      contentType: "application/json",
      body: JSON.stringify(
        count === 1
          ? { message: "Test database unavailable" }
          : { success: true, id: "test-ref" },
      ),
    });
  });
  await page.locator("#demoBookingForm button[type=submit]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#demoBookingForm .form-message")
      .textContent.includes("Test database"),
  );
  assert.equal(await page.locator("[name=name]").inputValue(), "Test Parent");
  await page.locator("#demoBookingForm button[type=submit]").click();
  await page.locator("#booking-success").waitFor({ state: "visible" });
  assert.equal(count, 2);
  assert.equal(keys[0], keys[1]);
  assert.ok(
    (await page.locator("#booking-whatsapp").getAttribute("href")).includes(
      "test-ref",
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 35 page/viewport checks, menu, course prefill, error preservation, retry ID, booking success, WhatsApp link, no JS errors.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
