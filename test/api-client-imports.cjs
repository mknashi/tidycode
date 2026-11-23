const {
  collectionAction,
  openSection,
  openTree,
} = require("./api-client-ui.cjs");
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
    let sends = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://httpbin.org/**", (route) => {
      sends++;
      return route.fulfill({ contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(() => {
      localStorage.setItem("tidycode-analytics-consent", "denied");
      localStorage.setItem("privacy-banner-dismissed", "true");
    });
    const url = process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api";
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const nav = page.getByRole("region", { name: "API collections" });
    await page
      .getByRole("button", { name: "New collection", exact: true })
      .click();
    await page
      .getByLabel("Collection name", { exact: true })
      .fill("Manual API");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await collectionAction(page, "Manual API", "New folder in Manual API");
    await page.getByLabel("Folder name", { exact: true }).fill("Customers");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await page
      .getByLabel("Request collection", { exact: true })
      .selectOption({ label: "Manual API" });
    await page
      .getByLabel("Request folder", { exact: true })
      .selectOption({ label: "Customers" });
    assert.match(await nav.innerText(), /First request/);
    // Import a collection with inheritance, folders, unsupported scripts, and two requests.
    const doc = {
      info: {
        name: "Imported API",
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      auth: {
        type: "bearer",
        bearer: [{ key: "token", value: "imported-secret" }],
      },
      event: [{ script: { exec: ['fetch("https://never.test")'] } }],
      item: [
        {
          name: "Customers",
          item: [
            {
              name: "List customers",
              request: { method: "GET", url: "https://httpbin.org/get" },
            },
            {
              name: "Create customer",
              request: {
                method: "POST",
                url: "https://httpbin.org/post",
                body: {
                  mode: "raw",
                  raw: '{"name":"Avery"}',
                  options: { raw: { language: "json" } },
                },
              },
            },
          ],
        },
      ],
    };
    await page
      .getByRole("button", { name: "Import requests", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Import API requests" });
    await dialog.waitFor();
    await page
      .getByLabel("Import content", { exact: true })
      .fill(JSON.stringify(doc));
    await page
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    assert.match(await dialog.innerText(), /2 requests · 1 folders/);
    assert.match(await dialog.innerText(), /scripts were skipped/);
    assert.ok(
      !(
        await page
          .getByLabel("Imported local storage preview", { exact: true })
          .inputValue()
      ).includes("imported-secret"),
    );
    // Import dialog keyboard shortcuts cannot send a background request.
    await page.getByLabel("Import content", { exact: true }).focus();
    await page.keyboard.press("ControlOrMeta+Enter");
    assert.equal(sends, 0);
    await page
      .getByRole("button", { name: "Import as new collection", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page.getByLabel("Request name", { exact: true }).inputValue(),
      "List customers",
    );
    assert.equal(await page.locator(".api-tab").count(), 2);
    assert.equal(sends, 0);
    await page.getByRole("button", { name: "Auth", exact: true }).click();
    assert.equal(
      await page.getByLabel("Bearer token", { exact: true }).inputValue(),
      "imported-secret",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await nav.waitFor();
    assert.match(await nav.innerText(), /Imported API/);
    assert.match(await nav.innerText(), /Create customer/);
    const imported = page.locator(".api-collection").filter({
      has: page.locator("summary").filter({ hasText: /^Imported API$/ }),
    });
    await imported
      .getByRole("button", { name: /POSTCreate customer|POST Create customer/ })
      .click();
    await page.getByRole("button", { name: "Auth", exact: true }).click();
    assert.equal(
      await page.getByLabel("Bearer token", { exact: true }).inputValue(),
      "",
    );
    assert.equal(sends, 0);
    await page.getByRole("button", { name: "Body", exact: true }).click();
    assert.match(
      await page.locator(".api-field-section .cm-content").innerText(),
      /Avery/,
    );
    // A file-based .http import stays in memory when requested.
    await page
      .getByRole("button", { name: "Import requests", exact: true })
      .click();
    await page.getByLabel("Choose import file", { exact: true }).setInputFiles({
      name: "health.http",
      mimeType: "text/plain",
      buffer: Buffer.from("### Health\nGET https://httpbin.org/get\n"),
    });
    await page
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await page
      .getByLabel("Save imported requests locally", { exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Import as new collection", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(sends, 0);
    // Remove organization without deleting requests.
    await collectionAction(
      page,
      "Imported API",
      "Remove collection Imported API",
    );
    await page.waitForTimeout(100);
    assert.equal(
      await page
        .getByRole("button", {
          name: "Collection actions for Imported API",
          exact: true,
        })
        .count(),
      0,
    );
    await openSection(page, "Saved locally");
    assert.match(
      await page.locator(".api-sidebar").innerText(),
      /Create customer/,
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await nav.waitFor();
    assert.match(await nav.innerText(), /health/);
    assert.ok(!/\bHealth\b/.test(await nav.innerText()));
    // Pasting cURL into the URL field opens review instead of executing it.
    await page.getByLabel("Request URL", { exact: true }).evaluate((el) => {
      const data = new DataTransfer();
      data.setData(
        "text",
        'curl https://httpbin.org/get -H "Accept: application/json"',
      );
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await dialog.waitFor();
    assert.match(
      await page.getByLabel("Import content", { exact: true }).inputValue(),
      /^curl /,
    );
    await page
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    assert.match(await dialog.innerText(), /1 requests/);
    await page
      .getByRole("button", { name: "Close import", exact: true })
      .click();
    // OpenAPI YAML uses the same review and explicit storage choice.
    await page
      .getByRole("button", { name: "Import requests", exact: true })
      .click();
    await page
      .getByLabel("Import content", { exact: true })
      .fill(
        "openapi: 3.0.3\ninfo:\n  title: YAML Catalog\nservers:\n  - url: https://httpbin.org\npaths:\n  /get:\n    get:\n      summary: Catalog health\n",
      );
    await page
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Import as new collection", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page.getByLabel("Request name", { exact: true }).inputValue(),
      "Catalog health",
    );
    assert.equal(sends, 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Import requests", exact: true })
      .click();
    await dialog.waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/tidycode-api-import-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Close import", exact: true })
      .click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: collection/folder creation, moving requests, Postman preview/import, auth exclusion, reload, body preservation, first-tab-only, HTTP file import, session-only choice, remove organization, no automatic sends, modal keyboard isolation, mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
