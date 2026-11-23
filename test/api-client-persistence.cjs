const { openSection } = require("./api-client-ui.cjs");
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
      viewport: { width: 1280, height: 1000 },
    });
    let calls = 0;
    await page.route("https://httpbin.org/**", (route) => {
      calls++;
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: '{"receipt":"saved-result"}',
      });
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem("tidycode-analytics-consent", "denied");
      localStorage.setItem("privacy-banner-dismissed", "true");
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
      { waitUntil: "domcontentloaded" },
    );
    await page
      .getByLabel("Request name", { exact: true })
      .fill("Saved customers");
    await page
      .getByLabel("Request URL", { exact: true })
      .fill("https://httpbin.org/post?token=query-sentinel");
    await page.getByRole("button", { name: "Auth", exact: true }).click();
    await page
      .getByLabel("Authentication", { exact: true })
      .selectOption("bearer");
    await page
      .getByLabel("Bearer token", { exact: true })
      .fill("bearer-sentinel");
    await page.getByRole("button", { name: "Headers", exact: true }).click();
    await page.getByRole("button", { name: "Add header", exact: true }).click();
    await page
      .getByLabel("header key", { exact: true })
      .last()
      .fill("X-Api-Key");
    await page
      .getByLabel("header value", { exact: true })
      .last()
      .fill("header-sentinel");
    await page
      .getByRole("button", { name: "Save locally", exact: true })
      .click();
    for (const name of [
      "Include query values",
      "Include other header values",
      "Include request body",
    ])
      assert.equal(
        await page.getByLabel(name, { exact: true }).isChecked(),
        true,
      );
    assert.equal(
      await page
        .getByLabel(
          "Include last response snapshot (body, readable headers, status, timing)",
          { exact: true },
        )
        .isChecked(),
      false,
    );
    await page.getByLabel("Include query values", { exact: true }).uncheck();

    assert.ok(
      !(
        await page
          .getByLabel("Local storage preview", { exact: true })
          .inputValue()
      ).includes("sentinel"),
    );
    await page
      .getByLabel("Include other header values", { exact: true })
      .check();
    assert.ok(
      !(
        await page
          .getByLabel("Local storage preview", { exact: true })
          .inputValue()
      ).includes("sentinel"),
    );
    await page
      .getByRole("button", { name: "Save reviewed template", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Reviewed template saved locally" })
      .waitFor();
    const records = () =>
      page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const open = indexedDB.open("tidycode-api-client", 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result;
              const tx = db.transaction("requests");
              const get = tx.objectStore("requests").getAll();
              tx.oncomplete = () => {
                resolve(get.result);
                db.close();
              };
            };
          }),
      );
    assert.ok(!JSON.stringify(await records()).includes("sentinel"));
    await page
      .getByLabel("Request name", { exact: true })
      .fill("Unsaved revision");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel("Request name", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Request name", { exact: true }).inputValue(),
      "Saved customers",
    );
    assert.ok(
      !(
        await page.getByLabel("Request URL", { exact: true }).inputValue()
      ).includes("query-sentinel"),
    );
    await page.getByRole("button", { name: "Auth", exact: true }).click();
    assert.equal(
      await page.getByLabel("Bearer token", { exact: true }).inputValue(),
      "",
    );
    await page.getByLabel("Close Saved customers", { exact: true }).click();
    await openSection(page, "Saved locally");
    await page
      .locator(".api-sidebar-section button")
      .filter({ hasText: "Saved customers" })
      .click();
    assert.equal(
      await page.getByLabel("Request name", { exact: true }).inputValue(),
      "Saved customers",
    );
    assert.equal(calls, 0, "Opening saved requests must not send them");
    assert.match(
      await page.locator(".api-status").innerText(),
      /No response snapshot was saved/,
    );
    await page
      .getByLabel("Authentication", { exact: true })
      .selectOption("none");
    await page.locator(".api-request-bar button[type=submit]").click();
    await page
      .locator(".api-status strong")
      .filter({ hasText: "202" })
      .waitFor();
    await page
      .getByRole("button", { name: "Save locally", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel(
          "Include last response snapshot (body, readable headers, status, timing)",
          { exact: true },
        )
        .isChecked(),
      true,
    );
    await page
      .getByRole("button", { name: "Save reviewed template", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Reviewed template saved locally" })
      .waitFor();
    assert.equal((await records())[0].response.status, 202);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .locator(".api-status")
      .filter({ hasText: "Saved snapshot" })
      .waitFor();
    assert.match(
      await page.locator(".api-response .cm-content").innerText(),
      /saved-result/,
    );
    assert.equal(calls, 1, "Reload must show snapshot without sending");
    await page.getByLabel("Close Saved customers", { exact: true }).click();
    await openSection(page, "Saved locally");
    await page
      .locator(".api-sidebar-section button")
      .filter({ hasText: "Saved customers" })
      .click();
    await page
      .locator(".api-status")
      .filter({ hasText: "Saved snapshot" })
      .waitFor();
    assert.equal(calls, 1, "Reopen must not send");
    // Storage failure must preserve the live draft and the previously committed copy.
    await page.evaluate(() => {
      window.originalIdbOpen = indexedDB.open;
      indexedDB.open = () => {
        throw new Error("simulated storage unavailable");
      };
    });
    await page
      .getByLabel("Request name", { exact: true })
      .fill("Recoverable draft");
    await page
      .getByRole("button", { name: "Save locally", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save reviewed template", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Could not save locally" })
      .waitFor();
    assert.equal(
      await page.getByLabel("Request name", { exact: true }).inputValue(),
      "Recoverable draft",
    );
    await page.evaluate(() => {
      indexedDB.open = window.originalIdbOpen;
    });
    assert.equal((await records())[0].request.name, "Saved customers");
    await page
      .getByRole("dialog", { name: "Save API request locally" })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await page.getByRole("button", { name: "Remove saved copy of Saved customers", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Saved copy removed from this device" }).waitFor();
    assert.equal((await records()).length, 0);
    assert.equal(await page.getByLabel("Request name", { exact: true }).inputValue(), "Recoverable draft");
    assert.equal(calls, 1, "Removing a saved copy must not send requests");
    await page.getByRole("button", { name: "Save locally", exact: true }).click();
    await page.getByRole("button", { name: "Save reviewed template", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Reviewed template saved locally" }).waitFor();
    assert.equal((await records()).length, 1);
    await openSection(page, "Storage & privacy");
    await page
      .getByRole("button", { name: "Clear API data", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Clear all API data", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "All local API data cleared" })
      .waitFor();
    assert.equal((await records()).length, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: reviewed save, credential omission, IndexedDB restoration, unsaved revision isolation, reopen closed template, storage failure recovery, clear local data",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
