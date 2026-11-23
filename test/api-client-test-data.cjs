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
      }),
      errors = [],
      apiCalls = [],
      aiCalls = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem("tidycode-analytics-consent", "denied");
      localStorage.setItem("privacy-banner-dismissed", "true");
    });
    await page.route("https://httpbin.org/**", (r) => {
      apiCalls.push(r.request().url());
      return r.fulfill({
        contentType: "application/json",
        body: '{"ok":true}',
      });
    });
    let bad = false;
    await page.route("https://api.groq.com/**", (r) => {
      aiCalls.push(JSON.parse(r.request().postData()));
      return r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: bad
                  ? "not json"
                  : '{"email":"fake@example.test","age":25}',
              },
            },
          ],
        }),
      });
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    );
    await page
      .getByRole("heading", { name: "API Client", exact: true })
      .waitFor();
    await page.evaluate(async () => {
      const { saveSecureSettings } =
        await import("/src/utils/secureStorage.js");
      await saveSecureSettings({
        provider: "groq",
        groqApiKey: "mock-test-key",
        groqModel: "mock-model",
      });
    });
    await page.reload();
    await page
      .getByRole("heading", { name: "API Client", exact: true })
      .waitFor();
    await page.getByLabel("HTTP method", { exact: true }).selectOption("POST");
    await page.getByRole("button", { name: "Body", exact: true }).click();
    await page.getByLabel("Body type", { exact: true }).selectOption("json");
    const editor = page.locator(".api-request-pane .cm-content");
    await editor.click();
    await page.keyboard.press("Meta+a");
    await page.keyboard.insertText('{"email":"PRIVATE_SOURCE_VALUE","age":42}');
    await page
      .getByRole("button", { name: "Generate test data", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.ok(
      !(await dialog.getByLabel("Test data schema").inputValue()).includes(
        "PRIVATE_SOURCE_VALUE",
      ),
    );
    const schema = {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        age: { type: "integer", minimum: 18, maximum: 80 },
      },
    };
    await dialog.getByLabel("Test data schema").fill(JSON.stringify(schema));
    await dialog
      .getByRole("button", { name: "Generate preview", exact: true })
      .click();
    const first = await dialog
      .getByLabel("Generated test data preview")
      .inputValue();
    await dialog
      .getByRole("button", { name: "Regenerate preview", exact: true })
      .click();
    assert.equal(
      await dialog.getByLabel("Generated test data preview").inputValue(),
      first,
    );
    assert.match(await editor.innerText(), /PRIVATE_SOURCE_VALUE/);
    assert.equal(apiCalls.length, 0);
    assert.equal(aiCalls.length, 0);
    await page.keyboard.press("Meta+Enter");
    await page.keyboard.press("Meta+s");
    assert.equal(apiCalls.length, 0);
    await dialog
      .getByRole("button", { name: "Apply to JSON body", exact: true })
      .click();
    await page.waitForTimeout(100);
    assert.match(await editor.innerText(), /@example.test/);
    await editor.focus();
    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(100);
    assert.match(await editor.innerText(), /PRIVATE_SOURCE_VALUE/);
    await page
      .getByRole("button", { name: "Generate test data", exact: true })
      .click();
    await dialog.getByLabel("Test data schema").fill(JSON.stringify(schema));
    await dialog
      .getByLabel("Test data generator", { exact: true })
      .selectOption("ai");
    assert.equal(
      await dialog
        .getByRole("button", { name: "Generate preview", exact: true })
        .isEnabled(),
      false,
    );
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Generate preview", exact: true })
      .click();
    await dialog.getByLabel("Generated test data preview").waitFor();
    assert.equal(aiCalls.length, 1);
    assert.ok(!JSON.stringify(aiCalls).includes("PRIVATE_SOURCE_VALUE"));
    assert.ok(!JSON.stringify(aiCalls).includes("httpbin.org"));
    assert.equal(apiCalls.length, 0);
    await dialog
      .getByRole("button", { name: "Apply to JSON body", exact: true })
      .click();
    assert.match(await editor.innerText(), /fake@example.test/);
    bad = true;
    await page
      .getByRole("button", { name: "Generate test data", exact: true })
      .click();
    await dialog
      .getByLabel("Test data generator", { exact: true })
      .selectOption("ai");
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Generate preview", exact: true })
      .click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(
      await dialog.getByLabel("Generated test data preview").count(),
      0,
    );
    await dialog
      .getByRole("button", { name: "Close test data generator", exact: true })
      .click();
    await page.getByRole("button", { name: "Params", exact: true }).click();
    await page
      .getByRole("button", { name: "Generate test data", exact: true })
      .click();
    await dialog
      .getByLabel("Test data schema")
      .fill(
        '{"type":"object","properties":{"page":{"type":"integer","minimum":1,"maximum":1}}}',
      );
    await dialog
      .getByRole("button", { name: "Generate preview", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Apply to query parameters", exact: true })
      .click();
    assert.match(
      await page.getByLabel("Request URL", { exact: true }).inputValue(),
      /[?&]page=1/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Generate test data", exact: true })
      .click();
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390);
    await page.screenshot({
      path: "/tmp/tidycode-test-data-mobile.png",
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: "Close test data generator", exact: true })
      .click();
    assert.deepEqual(errors, []);
    assert.equal(apiCalls.length, 0);
    console.log(
      "PASS: local deterministic data, inference privacy, preview/apply/undo, modal shortcut isolation, explicit AI consent and sanitized input, invalid AI rejection, query parameters, mobile, no API sends",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
