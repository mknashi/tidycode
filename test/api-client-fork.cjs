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
    await page.addInitScript(() => {
      localStorage.setItem("tidycode-analytics-consent", "denied");
      localStorage.setItem("privacy-banner-dismissed", "true");
    });
    await page.route("https://httpbin.org/**", (route) => {
      sends++;
      return route.fulfill({
        contentType: "application/json",
        body: '{"response":"snapshot"}',
      });
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
      { waitUntil: "domcontentloaded" },
    );
    await page
      .getByRole("button", { name: "Import requests", exact: true })
      .click();
    const doc = {
      info: {
        name: "Source API",
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      auth: {
        type: "bearer",
        bearer: [{ key: "token", value: "source-secret" }],
      },
      item: [
        {
          name: "Root folder",
          item: [
            {
              name: "Nested folder",
              item: [
                {
                  name: "Source request",
                  request: {
                    method: "GET",
                    url: "https://httpbin.org/get?limit=2",
                    header: [{ key: "X-Api-Key", value: "header-secret" }],
                  },
                },
                {
                  name: "Other request",
                  request: {
                    method: "POST",
                    url: "https://httpbin.org/post",
                    body: {
                      mode: "raw",
                      raw: '{"original":true}',
                      options: { raw: { language: "json" } },
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    await page
      .getByLabel("Import content", { exact: true })
      .fill(JSON.stringify(doc));
    await page
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Import as new collection", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Import API requests" })
      .waitFor({ state: "hidden" });
    await page.locator(".api-request-bar button[type=submit]").click();
    await page
      .locator(".api-status strong")
      .filter({ hasText: "200" })
      .waitFor();
    await page
      .getByLabel("Request name", { exact: true })
      .fill("Working draft");
    await page.getByLabel("HTTP method", { exact: true }).selectOption("POST");
    await page.getByRole("button", { name: "Body", exact: true }).click();
    await page.getByLabel("Body type", { exact: true }).selectOption("json");
    let editor = page.locator(".api-field-section .cm-content");
    await editor.click();
    await page.keyboard.insertText('{"draft":"current"}');
    await collectionAction(page, "Source API", "Fork collection Source API");
    const dialog = page.getByRole("dialog", { name: "Fork collection" });
    await dialog.waitFor();
    assert.equal(
      await page.getByLabel("Import content", { exact: true }).count(),
      0,
    );
    assert.match(
      await page.getByLabel("Fork name", { exact: true }).inputValue(),
      /My fork/,
    );
    const local = await page
      .getByLabel("Imported local storage preview", { exact: true })
      .inputValue();
    assert.ok(!local.includes("source-secret"));
    assert.ok(!local.includes("header-secret"));
    assert.match(local, /Working draft/);
    assert.match(local, /draft/);
    assert.match(local, /responseSnapshots/);
    await page.getByLabel("Fork name", { exact: true }).fill("Experiment");
    await page
      .getByRole("button", { name: "Create local fork", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(sends, 1);
    await page
      .locator(".api-status")
      .filter({ hasText: "Saved snapshot" })
      .waitFor();
    assert.match(
      await page.locator(".api-response .cm-content").innerText(),
      /snapshot/,
    );
    assert.match(await editor.innerText(), /current/);
    await page.getByRole("button", { name: "Auth", exact: true }).click();
    assert.equal(
      await page.getByLabel("Bearer token", { exact: true }).inputValue(),
      "",
    );
    await page.getByRole("button", { name: "Body", exact: true }).click();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText('{"draft":"fork only"}');
    const source = page.locator(".api-collection").filter({
      has: page.locator("summary").filter({ hasText: /^Source API$/ }),
    });
    await openTree(page, "Source API");
    await source
      .getByRole("button", { name: /POSTWorking draft|POST Working draft/ })
      .click();
    assert.match(await editor.innerText(), /current/);
    assert.ok(!(await editor.innerText()).includes("fork only"));
    // Copy exclusions apply to the new fork without changing the source.
    await collectionAction(page, "Source API", "Fork collection Source API");
    await page
      .getByLabel("Fork name", { exact: true })
      .fill("Session experiment");
    for (const label of [
      "Copy query values",
      "Copy other header values",
      "Copy request bodies",
      "Copy response snapshots (1 available)",
    ])
      await page.getByLabel(label, { exact: true }).uncheck();
    await page.getByLabel("Save fork locally", { exact: true }).uncheck();
    await page
      .getByRole("button", { name: "Create local fork", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal((await editor.innerText()).trim(), "");
    assert.ok(
      !(
        await page.getByLabel("Request URL", { exact: true }).inputValue()
      ).includes("limit=2"),
    );
    assert.equal(sends, 1);
    // A session-only fork can carry a response without mislabeling it as a fresh call.
    await collectionAction(page, "Source API", "Fork collection Source API");
    await page
      .getByLabel("Fork name", { exact: true })
      .fill("Response experiment");
    await page.getByLabel("Save fork locally", { exact: true }).uncheck();
    await page
      .getByRole("button", { name: "Create local fork", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .locator(".api-status")
      .filter({ hasText: "Copied snapshot" })
      .waitFor();
    assert.match(
      await page.locator(".api-response .cm-content").innerText(),
      /snapshot/,
    );
    assert.equal(sends, 1);
    const data = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open("tidycode-api-client", 1);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(["requests", "workspace"]);
            const records = tx.objectStore("requests").getAll();
            const cols = tx.objectStore("workspace").get("collections");
            tx.oncomplete = () => {
              resolve({ records: records.result, collections: cols.result });
              db.close();
            };
          };
        }),
    );
    const origin = data.collections.find((c) => c.name === "Source API");
    const fork = data.collections.find((c) => c.name === "Experiment");
    assert.equal(fork.forkedFrom, origin.id);
    assert.notEqual(fork.folders[0].id, origin.folders[0].id);
    assert.equal(fork.folders[1].parentId, fork.folders[0].id);
    assert.equal(
      data.records.filter((r) => r.request.collectionId === fork.id).length,
      2,
    );
    assert.equal(
      data.records.find(
        (r) =>
          r.request.collectionId === fork.id &&
          r.request.name === "Working draft",
      ).request.body,
      '{"draft":"current"}',
    );
    assert.ok(!JSON.stringify(data.records).includes("source-secret"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", {
        name: "Collection actions for Experiment",
        exact: true,
      })
      .waitFor();
    assert.equal(sends, 1);
    await openTree(page, "Experiment");
    assert.match(
      await page.getByRole("region", { name: "API collections" }).innerText(),
      /Local fork · independent copy/,
    );
    // Empty collections fork as metadata only, without creating a request or sending.
    await page
      .getByRole("button", { name: "New collection", exact: true })
      .click();
    await page
      .getByLabel("Collection name", { exact: true })
      .fill("Empty source");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await collectionAction(
      page,
      "Empty source",
      "Fork collection Empty source",
    );
    await page
      .getByRole("button", { name: "Create local fork", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .getByRole("button", {
        name: "Collection actions for Empty source — My fork",
        exact: true,
      })
      .waitFor();
    assert.equal(sends, 1);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: local fork review, latest unsaved drafts, nested ID remapping, credential removal, response snapshot copy, independent edits, copy exclusions, session-only choice, atomic persistence, reload, no extra sends",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
