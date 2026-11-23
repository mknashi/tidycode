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
        method: route.request().method(),
        body: route.request().postData(),
      });
      await route.fulfill({
        contentType: "application/json",
        body: '{"ok":true}',
      });
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    );
    const code = () =>
      page.getByRole("button", { name: "Code", exact: true }).first().click();
    await code();
    const source =
      '### List users\nGET https://httpbin.org/get\nAccept: application/json\n\n### Create user\nPOST https://httpbin.org/anything\nContent-Type: application/json\n\n{"name":"Avery"}';
    await page.evaluate((source) => {
      window.showOpenFilePicker = async (options) => {
        window.httpPickerOptions = options;
        return [
          {
            kind: "file",
            name: "workflow.http",
            getFile: async () =>
              new File([source], "workflow.http", { type: "text/plain" }),
            queryPermission: async () => "granted",
          },
        ];
      };
    }, source);
    await page.getByTitle(/^Open files:/).click();
    const extensions = await page.evaluate(() =>
      window.httpPickerOptions.types.flatMap((type) =>
        Object.values(type.accept).flat(),
      ),
    );
    assert.ok(extensions.includes(".http"));
    assert.ok(extensions.includes(".rest"));
    const editor = page.locator(".cm-content:visible").first();
    await page.getByRole("region", { name: "HTTP request outline" }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Open HTTP request", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Send HTTP request", exact: true })
        .count(),
      0,
    );
    await page.getByTitle("Hide HTTP requests", { exact: true }).click();
    const original = await editor.innerText();
    await page
      .locator(".cm-line:visible")
      .filter({ hasText: /^POST https/ })
      .click();
    await page.keyboard.press("Meta+Alt+o");
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="HTTP method"]')?.value === "POST",
    );
    assert.equal(await page.getByLabel("HTTP method").inputValue(), "POST");
    assert.equal(
      await page.getByLabel("Request name", { exact: true }).inputValue(),
      "Create user",
    );
    assert.equal(sent.length, 0);
    await code();
    assert.equal(await editor.innerText(), original);
    await page
      .locator(".cm-line:visible")
      .filter({ hasText: /^GET https/ })
      .click({ button: "right" });
    const context = page.getByRole("menu", {
      name: "HTTP editor actions",
      exact: true,
    });
    await context
      .getByRole("menuitem", { name: "Send request", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector('[aria-label="HTTP editor response"]')
        ?.textContent.includes("200"),
    );
    await page
      .getByRole("button", { name: "View in API client", exact: true })
      .click();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, "GET");
    assert.equal(sent[0].url, "https://httpbin.org/get");
    const countBeforeResend = await page.locator(".api-tab").count();
    await code();
    await editor.focus();
    await page.keyboard.press("Shift+F10");
    await context.waitFor();
    await page.keyboard.press("Escape");
    await context.waitFor({ state: "hidden" });
    await page.keyboard.press("Shift+F10");
    await context
      .getByRole("menuitem", { name: "Show HTTP requests", exact: true })
      .click();
    await page.getByRole("region", { name: "HTTP request outline" }).waitFor();
    assert.equal(await editor.innerText(), original);
    await editor.click();
    await page.keyboard.press("Meta+A");
    await page.keyboard.insertText("GET https://httpbin.org/anything?live=yes");
    await editor.focus();
    await page.keyboard.press("Meta+Alt+r");
    await page.waitForTimeout(200);
    assert.equal(sent.length, 2);
    assert.match(sent[1].url, /live=yes/);
    assert.equal(
      await page.locator(".api-tab").count(),
      countBeforeResend,
      "Sending the same source block reuses its API draft",
    );
    await code();
    await editor.focus();
    await editor.dispatchEvent("keydown", {
      key: "r",
      metaKey: true,
      altKey: true,
      repeat: true,
    });
    await page.waitForTimeout(100);
    assert.equal(
      sent.length,
      2,
      "Holding the send shortcut must not replay requests",
    );
    await page.locator("#file-input").setInputFiles({
      name: "review.rest",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "@base_url=https://httpbin.org\n### Review\nGET {{missing}}/get",
      ),
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".cm-content")].some((node) =>
        node.textContent.includes("@base_url=https://httpbin.org"),
      ),
    );
    await editor.focus();
    await page.keyboard.press("Control+Alt+r");
    await page
      .getByRole("region", { name: "HTTP editor response", exact: true })
      .getByText("Define variable “missing”", { exact: false })
      .waitFor();
    assert.equal(sent.length, 2);
    await code();
    await page.locator("#file-input").setInputFiles({
      name: "script.http",
      mimeType: "text/plain",
      buffer: Buffer.from(
        'GET https://httpbin.org/get\n\n> {% throw new Error("never") %}',
      ),
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".cm-content")].some((node) =>
        node.textContent.includes("throw new Error"),
      ),
    );
    await editor.focus();
    await page.keyboard.press("Meta+Alt+r");
    await page
      .getByText("HTTP-file scripts and file references are not supported.", {
        exact: false,
      })
      .waitFor();
    assert.equal(sent.length, 2);
    const savedCount = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const open = indexedDB.open("tidycode-api-client");
        open.onsuccess = () => resolve(open.result);
        open.onerror = reject;
      });
      try {
        return await new Promise((resolve, reject) => {
          const count = db
            .transaction("requests")
            .objectStore("requests")
            .count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = reject;
        });
      } finally {
        db.close();
      }
    });
    assert.equal(
      savedCount,
      0,
      "Editor request actions must not save API templates automatically",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: .http/.rest toolbar, cursor-block open/send, no open replay, source unchanged, live editor content, warnings require review, scripts blocked, mobile, one send per action",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
