const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1600, height: 1100 },
        acceptDownloads: true,
      }),
      errors = [],
      sent = [];
    let delayLogin = false;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("tidycode-analytics-consent", "denied");
      localStorage.setItem("privacy-banner-dismissed", "true");
    });
    await page.route("https://httpbin.org/**", async (route) => {
      const request = route.request();
      sent.push({
        url: request.url(),
        method: request.method(),
        body: request.postDataBuffer(),
        headers: request.headers(),
      });
      if (delayLogin && request.url().includes("/login"))
        await new Promise((r) => setTimeout(r, 800));
      try {
        await route.fulfill({
          contentType: "application/json",
          body: request.url().includes("/login")
            ? '{"token":"CHAIN_SECRET"}'
            : '{"ok":true,"id":9007199254740993}',
        });
      } catch {}
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    );
    const code = () =>
      page.getByRole("button", { name: "Code", exact: true }).first().click();
    await code();
    const source =
      '@base_url=https://httpbin.org\n@id=FILE\n### Get user\nGET {{base_url}}/get?value={{id}}\nAccept: application/json\n\n### Create user\nPOST {{base_url}}/anything\nContent-Type: application/json\n\n{"id":9007199254740993,"name":"Avery"}';
    const uploadSource = async (name, content) => {
      await page.locator("#file-input").setInputFiles({
        name,
        mimeType: "text/plain",
        buffer: Buffer.from(content),
      });
      await page.waitForFunction(
        (name) =>
          [...document.querySelectorAll("[data-tab-item]")].some((node) =>
            node.textContent.includes(name),
          ),
        name,
      );
      await page.waitForTimeout(100);
    };
    await uploadSource("capabilities.http", source);
    const outline = page.getByRole("region", {
        name: "HTTP request outline",
        exact: true,
      }),
      editor = page.locator(".cm-content:visible").first();
    await outline.waitFor();
    // Local completion and diagnostics.
    await editor.click();
    await page.keyboard.press("Meta+A");
    await page.keyboard.insertText("GET https://httpbin.org/get\nCon");
    await page.keyboard.press("Control+Space");
    await page
      .locator(".cm-tooltip-autocomplete")
      .getByText("Content-Type", { exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await editor.focus();
    await page.keyboard.press("Meta+A");
    await page.keyboard.insertText(source);
    await outline
      .getByRole("button", {
        name: "Go to HTTP request Create user",
        exact: true,
      })
      .click();
    await page.getByLabel("Format document", { exact: true }).click();
    await page.waitForTimeout(80);
    assert.match(await editor.innerText(), /9007199254740993/);
    assert.ok((await editor.innerText()).includes('\n  "id"'));
    await editor.focus();
    await page.keyboard.press("Meta+z");
    assert.ok(!(await editor.innerText()).includes('\n  "id"'));
    await outline
      .getByRole("button", {
        name: "Go to HTTP request Create user",
        exact: true,
      })
      .click();
    await page.keyboard.press("Meta+Alt+[");
    await page.locator(".cm-foldPlaceholder").first().waitFor();
    await page.keyboard.press("Meta+Alt+]");
    // Inline result, source retention, and resizing.
    await outline
      .getByRole("button", {
        name: "Send HTTP request Create user",
        exact: true,
      })
      .click();
    const response = page.getByRole("region", {
      name: "HTTP editor response",
      exact: true,
    });
    await response
      .getByRole("status")
      .filter({ hasText: "200" })
      .first()
      .waitFor();
    assert.equal(await outline.isVisible(), true);
    assert.equal(sent.length, 1);
    assert.match(sent[0].body.toString(), /9007199254740993/);
    const resize = page.getByRole("separator", {
      name: "Resize HTTP response",
      exact: true,
    });
    const before = await response.boundingBox();
    await resize.focus();
    await page.keyboard.press("ArrowUp");
    assert.ok((await response.boundingBox()).height > before.height);
    // Reviewed environment import and shared environment picker.
    await outline
      .getByRole("button", { name: "Import env", exact: true })
      .click();
    const envModal = page.getByRole("dialog", {
      name: "Import environments",
      exact: true,
    });
    await envModal
      .getByLabel("Environment import content")
      .fill(
        '{"Dev":{"base_url":"https://httpbin.org","id":"ENV","api_token":"ENV_SECRET"},"Production":{"base_url":"https://httpbin.org","id":"PROD"}}',
      );
    await envModal
      .getByLabel("Treat all imported values as secret", { exact: true })
      .uncheck();
    await envModal
      .getByRole("button", {
        name: "Save environment definitions locally",
        exact: true,
      })
      .click();
    await envModal.waitFor({ state: "hidden" });
    await outline
      .getByLabel("HTTP editor environment")
      .selectOption({ label: "Dev" });
    await outline
      .getByRole("button", { name: "Send HTTP request Get user", exact: true })
      .click();
    await page.waitForTimeout(300);
    assert.equal(new URL(sent[1].url).searchParams.get("value"), "ENV");
    // Source authoring, exact extraction, and no sends from edits.
    const actions = (name) =>
      outline
        .getByRole("button", {
          name: "Actions for HTTP request " + name,
          exact: true,
        })
        .click();
    await actions("Get user");
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await page
      .getByLabel("HTTP request name", { exact: true })
      .fill("Fetch user");
    await page
      .getByRole("button", { name: "Save request name", exact: true })
      .click();
    await outline
      .getByRole("button", {
        name: "Go to HTTP request Fetch user",
        exact: true,
      })
      .waitFor();
    await actions("Fetch user");
    await page
      .getByRole("menuitem", { name: "Duplicate", exact: true })
      .click();
    await outline
      .getByRole("button", {
        name: "Go to HTTP request Fetch user copy",
        exact: true,
      })
      .waitFor();
    await actions("Fetch user copy");
    await page
      .getByRole("menuitem", { name: "Move down", exact: true })
      .click();
    assert.equal(
      await outline
        .getByRole("button", { name: /^Go to HTTP request/ })
        .count(),
      3,
    );
    await actions("Create user");
    await page
      .getByRole("menuitem", { name: "Extract to .http file", exact: true })
      .click();
    const exportModal = page.getByRole("dialog", {
      name: "Export API requests",
      exact: true,
    });
    await exportModal.waitFor();
    assert.equal(
      await exportModal.getByLabel("Export format").inputValue(),
      "http",
    );
    await exportModal
      .getByLabel("Include request bodies", { exact: true })
      .check();
    assert.match(
      await exportModal.getByLabel("Export preview").inputValue(),
      /9007199254740993/,
    );
    const waitDownload = page.waitForEvent("download");
    await exportModal
      .getByRole("button", { name: "Download export", exact: true })
      .click();
    const download = await waitDownload;
    assert.match(download.suggestedFilename(), /\.http$/);
    assert.equal(
      await fs.readFile(await download.path(), "utf8"),
      await exportModal.getByLabel("Export preview").inputValue(),
    );
    await exportModal
      .getByRole("button", { name: "Close", exact: true })
      .click();
    assert.equal(sent.length, 2);
    await outline.getByLabel("Insert HTTP template").selectOption("binary");
    await outline
      .getByRole("button", {
        name: "Go to HTTP request Upload binary",
        exact: true,
      })
      .waitFor();
    assert.equal(sent.length, 2);
    // Browser file uploads through the shared API client.
    await page
      .getByRole("button", { name: /^API Client/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "New API request", exact: true })
      .click();
    await page
      .getByLabel("Request URL", { exact: true })
      .fill("https://httpbin.org/anything");
    await page.getByLabel("HTTP method").selectOption("POST");
    await page
      .getByLabel("Request sections", { exact: true })
      .getByRole("button", { name: "Body", exact: true })
      .click();
    await page.getByLabel("Body type").selectOption("multipart");
    await page
      .getByRole("button", { name: "Add multipart field", exact: true })
      .click();
    await page.getByLabel("Multipart name 1", { exact: true }).fill("name");
    await page.getByLabel("Multipart value 1", { exact: true }).fill("Avery");
    await page
      .getByRole("button", { name: "Add multipart field", exact: true })
      .click();
    await page.getByLabel("Multipart name 2", { exact: true }).fill("file");
    await page
      .getByLabel("Multipart type 2", { exact: true })
      .selectOption("file");
    await page.getByLabel("Multipart file 2", { exact: true }).setInputFiles({
      name: "private.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("PRIVATE_UPLOAD"),
    });
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForTimeout(150);
    assert.match(
      sent.at(-1).headers["content-type"],
      /multipart\/form-data; boundary=/,
    );
    assert.ok(sent.at(-1).body.toString().includes("PRIVATE_UPLOAD"));
    await page
      .getByRole("button", { name: "Save locally", exact: true })
      .click();
    const save = page.getByRole("dialog", { name: "Save API request locally" });
    await save
      .getByLabel("Include last response snapshot", { exact: false })
      .uncheck();
    assert.ok(
      !(await save.getByLabel("Local storage preview").inputValue()).includes(
        "PRIVATE_UPLOAD",
      ),
    );
    await save
      .getByRole("button", { name: "Save reviewed template", exact: true })
      .click();
    await save.waitFor({ state: "hidden" });
    await page.getByLabel("Body type").selectOption("binary");
    const binary = Buffer.from([0, 255, 1, 2, 3]);
    await page.getByLabel("Binary request file").setInputFiles({
      name: "payload.bin",
      mimeType: "application/octet-stream",
      buffer: binary,
    });
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForTimeout(150);
    assert.deepEqual(sent.at(-1).body, binary);
    // Run-only dependent requests, explicit start, and cancellation.
    await code();
    await uploadSource(
      "runner.http",
      "### Login\nPOST https://httpbin.org/login\nContent-Type: application/json\n\n{}\n### Fetch\nGET https://httpbin.org/data?token={{login_token}}",
    );
    await outline
      .getByRole("button", { name: "Run file", exact: true })
      .click();
    const runner = page.getByRole("dialog", {
      name: "Run HTTP requests",
      exact: true,
    });
    await runner
      .getByText("Capture a JSON value for following steps", { exact: true })
      .first()
      .click();
    await runner.getByLabel("Capture path 1", { exact: true }).fill("/token");
    await runner
      .getByLabel("Capture name 1", { exact: true })
      .fill("login_token");
    const beforeShortcuts = sent.length;
    await runner.getByLabel("Capture name 1", { exact: true }).focus();
    await page.keyboard.press("Meta+Enter");
    await page.keyboard.press("Meta+Alt+r");
    assert.equal(sent.length, beforeShortcuts);
    const initial = sent.length;
    await runner
      .getByRole("button", { name: "Start selected requests", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.api-runner-step [data-state="passed"]')]
          .length === 2,
    );
    assert.equal(sent.length, initial + 2);
    assert.equal(
      new URL(sent.at(-1).url).searchParams.get("token"),
      "CHAIN_SECRET",
    );
    const variables = await page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const open = indexedDB.open("tidycode-api-client");
        open.onsuccess = () => resolve(open.result);
      });
      try {
        return await new Promise((resolve) => {
          const read = db
            .transaction("workspace")
            .objectStore("workspace")
            .get("variables");
          read.onsuccess = () => resolve(read.result);
        });
      } finally {
        db.close();
      }
    });
    assert.ok(!JSON.stringify(variables).includes("CHAIN_SECRET"));
    assert.ok(!JSON.stringify(variables).includes("ENV_SECRET"));
    assert.ok(
      variables.environments.some((env) =>
        env.variables.some((row) => row.key === "id" && row.value === "ENV"),
      ),
    );
    delayLogin = true;
    const beforeStop = sent.length;
    await runner
      .getByRole("button", { name: "Start selected requests", exact: true })
      .click();
    await page.waitForTimeout(100);
    await runner.getByRole("button", { name: "Stop run", exact: true }).click();
    await runner.getByText("cancelled", { exact: true }).waitFor();
    await page.waitForTimeout(900);
    assert.equal(sent.length, beforeStop + 1);
    await runner.getByRole("button", { name: "Close", exact: true }).click();
    await uploadSource(
      "xml-body.http",
      "### XML request\nPOST https://httpbin.org/anything\nContent-Type: application/xml\n\n<root><id>42</id><name>Avery</name></root>",
    );
    await outline
      .getByRole("button", {
        name: "Go to HTTP request XML request",
        exact: true,
      })
      .click();
    const xmlOriginal = await editor.innerText();
    await page.getByLabel("Format document", { exact: true }).click();
    assert.ok((await editor.innerText()).includes("\n  <id>42</id>"));
    await editor.focus();
    await page.keyboard.press("Meta+z");
    assert.equal(await editor.innerText(), xmlOriginal);
    await page
      .getByRole("button", { name: /^API Client/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Import requests", exact: true })
      .click();
    await page
      .getByLabel("Import content", { exact: true })
      .fill(
        JSON.stringify({
          info: {
            name: "Runner fixture",
            schema:
              "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
          },
          item: [
            {
              name: "Read",
              request: { method: "GET", url: "https://httpbin.org/get" },
            },
          ],
        }),
      );
    await page
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Import as new collection", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Collection actions for Runner fixture",
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", {
        name: "Run collection Runner fixture",
        exact: true,
      })
      .click();
    const apiRunner = page.getByRole("dialog", {
      name: "Run HTTP requests",
      exact: true,
    });
    await apiRunner
      .getByText("Capture a JSON value for following steps", { exact: true })
      .click();
    await apiRunner.getByLabel("Capture name 1", { exact: true }).focus();
    const beforeApiShortcuts = sent.length;
    await page.keyboard.press("Meta+Enter");
    await page.keyboard.press("Meta+s");
    assert.equal(sent.length, beforeApiShortcuts);
    await apiRunner.getByRole("button", { name: "Close", exact: true }).click();
    await code();
    await page.screenshot({
      path: "/tmp/tidycode-browser-capabilities.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const closeExplorer = page.getByTitle("Close Explorer", { exact: true });
    if (await closeExplorer.isVisible()) await closeExplorer.click();
    await page.waitForTimeout(250);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: local completion, folds, precision-preserving body formatting/undo, inline response/resize, env import/scope/secrets, authoring/extraction/templates, multipart/binary uploads, sequential dependency capture/cancel, mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
