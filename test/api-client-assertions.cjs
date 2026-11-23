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
    let calls = 0;
    await page.route("https://httpbin.org/**", async (route) => {
      calls++;
      await route.fulfill({
        contentType: "application/json",
        body: '{"id":9007199254740993,"ready":true}',
      });
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    );
    const requestSections = page.getByLabel("Request sections", {
      exact: true,
    });
    const responseSections = page.getByLabel("Response views", { exact: true });
    await requestSections
      .getByRole("button", { name: "Assertions", exact: true })
      .click();
    const add = page.getByRole("button", {
      name: "Add assertion",
      exact: true,
    });
    await add.click();
    await add.click();
    await page
      .getByLabel("Assertion type 2", { exact: true })
      .selectOption("jsonEquals");
    await page.getByLabel("Assertion target 2", { exact: true }).fill("/id");
    await page
      .getByLabel("Assertion expected 2", { exact: true })
      .fill("9007199254740993");
    await add.click();
    await page
      .getByLabel("Assertion type 3", { exact: true })
      .selectOption("headerContains");
    await add.click();
    await page.getByLabel("Enable assertion 4", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await responseSections
      .getByRole("button", { name: "Assertions", exact: true })
      .click();
    const results = page.getByLabel("Assertion results", { exact: true });
    await results
      .getByText("3 passed · 0 failed · 1 skipped", { exact: true })
      .waitFor();
    await page.getByLabel("Assertion expected 1", { exact: true }).fill("404");
    assert.match(await results.innerText(), /3 passed · 0 failed/);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await results
      .getByText("2 passed · 1 failed · 1 skipped", { exact: true })
      .waitFor();
    assert.match(
      await results.innerText(),
      /Expected HTTP 404; received HTTP 200/,
    );
    assert.equal(calls, 2);
    await page
      .getByRole("button", { name: "Save locally", exact: true })
      .click();
    const save = page.getByRole("dialog", { name: "Save API request locally" });
    const include = save.getByLabel(
      "Include assertions (expected values may contain private data)",
      { exact: true },
    );
    assert.equal(await include.isChecked(), false);
    await include.check();
    await save
      .getByRole("button", { name: "Save reviewed template", exact: true })
      .click();
    await save.waitFor({ state: "hidden" });
    await page.screenshot({
      path: "/tmp/tidycode-api-assertions.png",
      fullPage: true,
    });
    await page.reload();
    await requestSections
      .getByRole("button", { name: "Assertions", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Assertion expected 1", { exact: true })
        .inputValue(),
      "404",
    );
    await responseSections
      .getByRole("button", { name: "Assertions", exact: true })
      .click();
    await page
      .getByText("Send this request to run its assertions.", { exact: false })
      .waitFor();
    assert.equal(calls, 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Request", exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: assertion builder, status/header/precise JSON checks, disabled checks, last-send results, failure reasons, explicit local saving/reload, snapshot excludes results, mobile, no extra sends",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
