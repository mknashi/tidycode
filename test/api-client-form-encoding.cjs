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
    let outgoing;
    await page.addInitScript(() => {
      localStorage.setItem("tidycode-analytics-consent", "denied");
      localStorage.setItem("privacy-banner-dismissed", "true");
    });
    await page.route("https://httpbin.org/**", (r) => {
      outgoing = {
        body: r.request().postData(),
        headers: r.request().headers(),
      };
      return r.fulfill({
        status: 400,
        contentType: "application/json",
        body: '{"error":"synthetic_error","error_description":"readable HTTP error"}',
      });
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    );
    await page
      .getByRole("heading", { name: "API Client", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Variables", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Variables and environments",
    });
    await dialog.waitFor();
    const secret = "synthetic+secret&scope=unexpected%2F= /é";
    for (const [key, value] of [
      ["Consumer_Key", "synthetic+key"],
      ["Consumer_Secret", secret],
    ]) {
      await dialog
        .getByRole("button", { name: "Add variable", exact: true })
        .click();
      await dialog
        .getByLabel("Variable name", { exact: true })
        .last()
        .fill(key);
      await dialog
        .getByLabel("Variable value", { exact: true })
        .last()
        .fill(value);
    }
    await dialog
      .getByRole("button", { name: "Apply for this session", exact: true })
      .click();
    await page.getByLabel("HTTP method", { exact: true }).selectOption("POST");
    await page
      .getByRole("button", { name: "Headers", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Add header", exact: true }).click();
    await page
      .getByLabel("header key", { exact: true })
      .last()
      .fill("Content-Type");
    await page
      .getByLabel("header value", { exact: true })
      .last()
      .fill("application/json");
    await page.getByRole("button", { name: "Body", exact: true }).click();
    await page.getByLabel("Body type", { exact: true }).selectOption("form");
    await page
      .getByRole("button", { name: "Use form Content-Type", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Use form Content-Type", exact: true })
        .count(),
      0,
    );

    for (const [key, value] of [
      ["grant_type", "client_credentials"],
      ["client_id", "{{Consumer_Key}}"],
      ["client_secret", "{{Consumer_Secret}}"],
      ["tag", "a+b&c=d%2F é"],
      ["tag", ""],
    ]) {
      await page
        .getByRole("button", { name: "Add form field", exact: true })
        .click();
      await page.getByLabel("Form field key", { exact: true }).last().fill(key);
      await page
        .getByLabel("Form field value", { exact: true })
        .last()
        .fill(value);
    }
    await page.getByRole("button", { name: "Raw", exact: true }).click();
    const editor = page.locator(".api-request-pane .cm-content");
    const raw = await editor.innerText();
    assert.match(
      raw,
      /grant_type=client_credentials&client_id=\{\{Consumer_Key\}\}/,
    );
    await editor.click();
    await page.keyboard.press("Meta+a");
    await page.keyboard.insertText("grant_type:client_credentials");
    await page.getByText(/This looks like key: value text/).waitFor();
    await editor.click();
    await page.keyboard.press("Meta+a");
    await page.keyboard.insertText(raw);
    await page.getByRole("button", { name: "Fields", exact: true }).click();
    assert.equal(
      await page
        .getByLabel("Form field value", { exact: true })
        .nth(3)
        .inputValue(),
      "a+b&c=d%2F é",
    );
    assert.equal(
      await page
        .getByLabel("Form field value", { exact: true })
        .nth(2)
        .inputValue(),
      "{{Consumer_Secret}}",
    );
    await page
      .getByRole("button", { name: "Add form field", exact: true })
      .click();
    await page
      .getByLabel("Form field key", { exact: true })
      .last()
      .fill("remove_me");
    await page
      .getByRole("button", { name: "Remove form field remove_me", exact: true })
      .click();
    await page.locator(".api-request-bar button[type=submit]").click();
    await page
      .locator(".api-status strong")
      .filter({ hasText: "400" })
      .waitFor();
    const fields = new URLSearchParams(outgoing.body);
    assert.equal(fields.get("client_id"), "synthetic+key");
    assert.equal(fields.get("client_secret"), secret);
    assert.equal(fields.has("scope"), false);
    assert.match(
      outgoing.headers["content-type"],
      /application\/x-www-form-urlencoded/,
    );
    assert.deepEqual(fields.getAll("tag"), ["a+b&c=d%2F é", ""]);
    assert.equal(fields.has("remove_me"), false);
    assert.ok(
      !(await page.locator(".api-form-body").innerText()).includes(secret),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByRole("tab", {name:"Request",exact:true}).click();
    await page.locator(".api-form-body").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/tidycode-form-fields-mobile.png",
      fullPage: true,
    });
    console.log(
      "PASS: form Fields/Raw round trip, colon warning, duplicates/blanks/remove, reserved characters and secret references preserved over browser transport, HTTP 400 readable, mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
