// Run against a local Vite server. Set PLAYWRIGHT_MODULE if Playwright is not installed locally.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let calls = 0;
  let delay = 0;
  await page.route("https://httpbin.org/**", async (route) => {
    calls++;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ customers: [{ id: 42, name: "Avery" }] }),
      });
    } catch {
      /* cancelled route */
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("tidycode-analytics-consent", "denied");
    localStorage.setItem("privacy-banner-dismissed", "true");
  });
  await page.goto(
    process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    { waitUntil: "domcontentloaded" },
  );
  const workspace = page.getByRole("heading", {
    name: "API Client",
    exact: true,
  });
  await workspace.waitFor();
  await page.locator(".api-request-bar button[type=submit]").click();
  await page.locator(".api-status strong").filter({ hasText: "200" }).waitFor();
  assert.equal(calls, 1);
  await page.getByRole("button", { name: "Body · Raw", exact: true }).click();
  assert.match(
    await page.locator(".api-response .cm-content").innerText(),
    /Avery/,
  );
  await page
    .getByRole("button", { name: "HTTP headers", exact: true })
    .last()
    .click();
  assert.match(
    await page.locator(".api-header-table").innerText(),
    /application\/json/,
  );
  await page.getByRole("button", { name: "Auth", exact: true }).click();
  await page.locator(".api-field-section select").selectOption("bearer");
  await page
    .getByLabel("Bearer token", { exact: true })
    .fill("sentinel-secret-not-persisted");
  const state = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  assert.ok(!state.includes("sentinel-secret"));
  await page.getByRole("button", { name: "Code", exact: true }).first().click();
  await page
    .getByRole("button", { name: "API Client", exact: true })
    .first()
    .click();
  assert.equal(
    await page.getByLabel("Bearer token", { exact: true }).inputValue(),
    "sentinel-secret-not-persisted",
  );
  await page
    .getByLabel("Request URL", { exact: true })
    .fill("https://other.test/resource");
  await page.locator(".api-request-bar button[type=submit]").click();
  await page
    .getByRole("button", { name: "Approve destination for this draft" })
    .waitFor();
  assert.equal(calls, 1);
  await page
    .getByLabel("Request URL", { exact: true })
    .fill("https://httpbin.org/get");
  await page.locator(".api-request-bar button[type=submit]").click();
  await page.locator(".api-status strong").filter({ hasText: "200" }).waitFor();
  await page
    .getByRole("button", { name: "Body · Pretty", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open in editor", exact: true })
    .click();
  assert.equal(
    await page.getByRole("dialog", { name: "Open response in editor" }).count(),
    0,
  );
  await page
    .getByRole("status")
    .filter({ hasText: "Temporary response copy" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("status")
      .filter({ hasText: "Temporary response copy" })
      .evaluate((el) => getComputedStyle(el).position),
    "fixed",
    "Response-copy notice should be a toast outside the editor layout",
  );
  await page.waitForTimeout(2300);
  assert.ok(
    !(
      await page.evaluate(() => localStorage.getItem("notepad-tabs") || "")
    ).includes("Avery"),
    "Temporary response must not enter editor persistence",
  );
  assert.equal(await page.locator(".api-client").isVisible(), false);
  assert.match(await page.locator(".cm-content").first().innerText(), /Avery/);
  await page
    .getByRole("button", { name: "API Client", exact: true })
    .first()
    .click();
  const callsBeforeCancel = calls;
  delay = 5000;
  await page.locator(".api-request-bar button[type=submit]").click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForTimeout(1300);
  await page
    .locator(".api-status")
    .filter({ hasText: "cancelled" })
    .waitFor({ timeout: 3000 });
  await page.waitForTimeout(4300);
  assert.equal(
    calls,
    callsBeforeCancel + 1,
    "Cancel must never replay the request",
  );
  assert.match(await page.locator(".api-status").innerText(), /cancelled/);
  await page
    .getByRole("button", { name: "New API request", exact: true })
    .click();
  await page
    .getByLabel("Request name", { exact: true })
    .fill("Draft survives switching");
  await page.getByRole("button", { name: "Code", exact: true }).first().click();
  await page
    .getByRole("button", { name: "API Client", exact: true })
    .first()
    .click();
  assert.equal(
    await page.getByLabel("Request name", { exact: true }).inputValue(),
    "Draft survives switching",
  );
  await page
    .getByLabel("Request URL", { exact: true })
    .fill("https://httpbin.org/post?tag=a&tag=b");
  await page.getByRole("button", { name: "Params", exact: true }).click();
  await page.getByLabel("Enable parameter", { exact: true }).last().uncheck();
  await page
    .locator(".api-tab button")
    .filter({ hasText: /^First request$/ })
    .click();
  await page
    .locator(".api-tab button")
    .filter({ hasText: /^Draft survives switching$/ })
    .click();
  assert.equal(
    await page
      .getByLabel("Enable parameter", { exact: true })
      .last()
      .isChecked(),
    false,
  );
  delay = 0;
  await page.getByLabel("HTTP method", { exact: true }).selectOption("POST");
  await page.getByRole("button", { name: "Body", exact: true }).click();
  await page.getByLabel("Body type", { exact: true }).selectOption("json");
  const body = page.locator(".api-field-section .cm-content");
  await body.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText('{"a":1}');
  await page.getByRole("button", { name: "Format JSON", exact: true }).click();
  assert.match(await body.innerText(), /  "a": 1/);
  await page.keyboard.press("ControlOrMeta+Z");
  assert.equal(await body.innerText(), '{"a":1}');
  await body.click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.locator(".api-status strong").filter({ hasText: "200" }).waitFor();
  await page.screenshot({
    path: "/tmp/tidycode-api-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "/tmp/tidycode-api-mobile.png",
    fullPage: true,
  });
  await page.evaluate(() => localStorage.setItem("tidycode-theme", "light"));
  await page.reload();
  await workspace.waitFor();
  assert.equal(
    await page.locator(".api-client").getAttribute("data-theme"),
    "light",
  );
  assert.equal(
    await page.getByLabel("Request name", { exact: true }).inputValue(),
    "First request",
  );
  assert.equal(await page.locator(".api-history-item").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: send, response views, auth memory, workspace switching, origin binding, editor copy, cancellation, request tabs, mobile, reload reset; no runtime errors",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
