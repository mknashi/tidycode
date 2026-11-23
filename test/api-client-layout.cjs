const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem("tidycode-analytics-consent", "denied");
      localStorage.setItem("privacy-banner-dismissed", "true");
    });
    let delay = 100;
    let calls = 0;
    await page.route("https://httpbin.org/**", async (route) => {
      calls++;
      await new Promise((r) => setTimeout(r, delay));
      try {
        await route.fulfill({
          contentType: "application/json",
          body: '{"result":"layout-fixture"}',
        });
      } catch {}
    });
    const url = process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api";
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("separator", { name: "Resize request and response" })
      .waitFor();
    const separator = page.getByRole("separator", {
      name: "Resize request and response",
    });
    await separator.focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(await separator.getAttribute("aria-valuenow"), "48");
    assert.equal(await page.locator("#api-request-pane").isVisible(), true);
    assert.equal(await page.locator("#api-response-pane").isVisible(), true);
    await page.getByLabel("API layout", { exact: true }).selectOption("tabs");
    const requestTab = page.getByRole("tab", { name: "Request", exact: true });
    const responseTab = page.getByRole("tab", { name: /^Response/ });
    assert.equal(await requestTab.getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("#api-response-pane").isVisible(), false);
    await page.getByRole("button", { name: "Body", exact: true }).click();
    await page.getByLabel("Body type", { exact: true }).selectOption("json");
    const body = page.locator(".api-field-section .cm-content");
    await body.click();
    await page.keyboard.insertText('{"draft":1}');
    await responseTab.click();
    await requestTab.click();
    assert.equal(await body.innerText(), '{"draft":1}');
    await page.locator(".api-request-bar button[type=submit]").click();
    await page
      .locator(".api-status strong")
      .filter({ hasText: "200" })
      .waitFor();
    assert.equal(await responseTab.getAttribute("aria-selected"), "true");
    assert.match(await responseTab.innerText(), /200.*ms.*B/);
    assert.equal(
      await page.getByLabel("Request URL", { exact: true }).isVisible(),
      true,
    );
    assert.equal(
      await page.locator(".api-request-bar button[type=submit]").isVisible(),
      true,
    );
    // Returning to the draft during a slow send must not be interrupted on completion.
    delay = 1000;
    await page.locator(".api-request-bar button[type=submit]").click();
    await requestTab.click();
    await page.waitForTimeout(1300);
    assert.equal(await requestTab.getAttribute("aria-selected"), "true");
    assert.equal(calls, 2);
    await requestTab.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await responseTab.getAttribute("aria-selected"), "true");
    await page.reload({ waitUntil: "domcontentloaded" });
    await requestTab.waitFor();
    assert.equal(
      await page.getByLabel("API layout", { exact: true }).inputValue(),
      "tabs",
    );
    await page.getByLabel("API layout", { exact: true }).selectOption("split");
    await separator.waitFor();
    assert.equal(await separator.getAttribute("aria-valuenow"), "48");
    // Pointer resizing and keyboard bounds both work.
    const rect = await separator.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + 30);
    await page.mouse.down();
    await page.mouse.move(rect.x + 70, rect.y + 30);
    await page.mouse.up();
    assert.notEqual(await separator.getAttribute("aria-valuenow"), "48");
    await separator.focus();
    await page.keyboard.press("End");
    assert.equal(await separator.getAttribute("aria-valuenow"), "70");
    await page.keyboard.press("Home");
    assert.equal(await separator.getAttribute("aria-valuenow"), "30");
    await page.setViewportSize({ width: 390, height: 844 });
    await requestTab.waitFor();
    assert.equal(await separator.count(), 0);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.locator(".api-request-bar button[type=submit]").click();
    await page
      .locator(".api-status strong")
      .filter({ hasText: "200" })
      .waitFor();
    assert.equal(await responseTab.getAttribute("aria-selected"), "true");
    await page.screenshot({
      path: "/tmp/tidycode-api-tabs-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await separator.waitFor();
    await page.screenshot({
      path: "/tmp/tidycode-api-split-desktop.png",
      fullPage: true,
    });
    await page.getByLabel("API layout").selectOption("stacked");
    assert.equal(
      await page.locator(".api-panes").getAttribute("data-layout"),
      "stacked",
    );
    let requestBox = await page.locator(".api-request-pane").boundingBox();
    let responseBox = await page.locator(".api-response-pane").boundingBox();
    assert.ok(responseBox.y >= requestBox.y + requestBox.height);
    assert.ok(Math.abs(responseBox.x - requestBox.x) < 2);
    assert.equal(await separator.count(), 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('.api-panes[data-layout="stacked"]').waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.api-panes[data-layout="stacked"]').waitFor();
    assert.equal(await page.getByLabel("API layout").inputValue(), "stacked");
    requestBox = await page.locator(".api-request-pane").boundingBox();
    responseBox = await page.locator(".api-response-pane").boundingBox();
    assert.ok(responseBox.y >= requestBox.y + requestBox.height);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: responsive split/tabs, saved preference, pointer/keyboard divider, draft preservation, send navigation, no completion focus steal, tab keyboard navigation, shared controls, mobile overflow",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
