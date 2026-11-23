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
    const sent = [];
    await page.route("https://httpbin.org/**", async (route) => {
      sent.push({
        url: route.request().url(),
        headers: route.request().headers(),
      });
      await route.fulfill({
        contentType: "application/json",
        body: '{"ok":true}',
      });
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    );
    const authTab = page
      .locator(".api-section-tabs")
      .getByRole("button", { name: "Auth", exact: true });
    await authTab.click();
    await page
      .getByLabel("Authentication", { exact: true })
      .selectOption("basic");
    await page.getByLabel("Basic username").fill("Avery");
    await page.getByLabel("Basic password").fill("BASIC_SECRET");
    assert.equal(
      await page.getByLabel("Basic password").getAttribute("type"),
      "password",
    );
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector(".api-response")?.textContent.includes("200"),
    );
    assert.equal(
      sent[0].headers.authorization,
      "Basic " + Buffer.from("Avery:BASIC_SECRET").toString("base64"),
    );
    await page
      .getByRole("button", { name: "Save locally", exact: true })
      .click();
    // Do not save the response; credentials belong only in memory.
    const saveDialog = page.getByRole("dialog", {
      name: "Save API request locally",
    });
    const responseChoice = saveDialog.getByLabel(
      "Include last response snapshot",
      { exact: false },
    );
    if (await responseChoice.count()) await responseChoice.uncheck();
    await page
      .getByRole("button", { name: "Save reviewed template", exact: true })
      .click();
    await saveDialog.waitFor({ state: "hidden" });
    await page.reload();
    await authTab.click();
    assert.equal(
      await page.getByLabel("Authentication", { exact: true }).inputValue(),
      "basic",
    );
    assert.equal(await page.getByLabel("Basic username").inputValue(), "");
    assert.equal(await page.getByLabel("Basic password").inputValue(), "");
    await page
      .getByLabel("Authentication", { exact: true })
      .selectOption("apikey");
    await page.getByLabel("API key name").fill("X-Custom");
    await page.getByLabel("API key value").fill("API_SECRET");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForTimeout(150);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].headers["x-custom"], "API_SECRET");
    await page.getByLabel("API key location").selectOption("query");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForTimeout(150);
    assert.equal(sent.length, 3);
    assert.equal(
      new URL(sent[2].url).searchParams.get("X-Custom"),
      "API_SECRET",
    );
    assert.ok(
      !(
        await page.getByLabel("Request URL", { exact: true }).inputValue()
      ).includes("API_SECRET"),
    );
    const url = await page
      .getByLabel("Request URL", { exact: true })
      .inputValue();
    await page
      .getByLabel("Request URL", { exact: true })
      .fill(url + (url.includes("?") ? "&" : "?") + "X-Custom=duplicate");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page
      .getByText("The API key is set in both Params and Auth. Choose one.", {
        exact: true,
      })
      .waitFor();
    assert.equal(sent.length, 3);
    await page.getByRole("button", { name: "Duplicate", exact: true }).click();
    assert.equal(
      await page.getByLabel("Authentication", { exact: true }).inputValue(),
      "none",
    );
    await page
      .getByLabel("Authentication", { exact: true })
      .selectOption("apikey");
    assert.equal(await page.getByLabel("API key value").inputValue(), "");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: Basic send/masking/save/reload credential omission, API-key header/query send, transient URL, conflict prevents send, duplicate credential omission, mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
