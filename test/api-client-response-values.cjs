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
    let sends = 0;
    await page.route("https://httpbin.org/**", async (route) => {
      sends++;
      await route.fulfill({
        contentType: "application/json",
        body: '{"id":9007199254740993,"token":"PRIVATE_TOKEN","nested":{"label":"Avery"}}',
      });
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    );
    await page
      .getByRole("button", { name: "Import requests", exact: true })
      .click();
    const file = page.getByLabel("Choose import file", { exact: true });
    await file.setInputFiles({
      name: "too-large.json",
      mimeType: "application/json",
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 32),
    });
    await page
      .getByText("Choose a text file no larger than 10 MiB.", { exact: true })
      .waitFor();
    const collection = JSON.stringify({
      info: {
        name: "Large collection",
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        description: "x".repeat(4 * 1024 * 1024),
      },
      item: [
        {
          name: "Values",
          request: { method: "GET", url: "https://httpbin.org/get" },
        },
      ],
    });
    await file.setInputFiles({
      name: "large.json",
      mimeType: "application/json",
      buffer: Buffer.from(collection),
    });
    await page
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Import as new collection", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Import API requests" })
      .waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const details = page.locator(".api-response-values");
    await details.locator("summary").click();
    await page.getByLabel("Selected response JSON path").selectOption("/id");
    await page.getByRole("button", { name: "Show value", exact: true }).click();
    assert.equal(
      await page.getByLabel("Selected response JSON value").inputValue(),
      "9007199254740993",
    );
    await page.evaluate(() => {
      navigator.clipboard.writeText = async (text) => {
        window.lastCopiedValue = text;
      };
    });
    await page.getByRole("button", { name: "Copy path", exact: true }).click();
    assert.equal(await page.evaluate(() => window.lastCopiedValue), "/id");
    await page.getByRole("button", { name: "Copy value", exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.lastCopiedValue),
      "9007199254740993",
    );
    const save = async (name, persist, nonsecret = false) => {
      await page
        .getByRole("button", { name: "Save as variable", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Save response value as variable",
        exact: true,
      });
      await dialog.getByLabel("Response variable name").fill(name);
      if (nonsecret)
        await dialog
          .getByLabel("Secret (value stays in memory)", { exact: true })
          .uncheck();
      await dialog
        .getByRole("button", {
          name: persist ? "Save variable locally" : "Apply for this session",
          exact: true,
        })
        .click();
      await dialog.waitFor({ state: "hidden" });
    };
    await save("session_id", false, true);
    await save("saved_id", true, true);
    await page
      .getByRole("button", { name: "Save as variable", exact: true })
      .click();
    const modal = page.getByRole("dialog", {
      name: "Save response value as variable",
      exact: true,
    });
    await modal.getByLabel("Response variable name").fill("saved_id");
    assert.equal(
      await modal
        .getByRole("button", { name: "Save variable locally", exact: true })
        .isDisabled(),
      true,
    );
    await modal
      .getByLabel("Replace existing variable in this scope", { exact: true })
      .check();
    await modal
      .getByRole("button", { name: "Apply for this session", exact: true })
      .click();
    await modal.waitFor({ state: "hidden" });
    await page.getByLabel("Selected response JSON path").selectOption("/token");
    await save("access_token", true);
    const variables = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const read = indexedDB.open("tidycode-api-client");
        read.onsuccess = () => resolve(read.result);
        read.onerror = reject;
      });
      try {
        return await new Promise((resolve, reject) => {
          const read = db
            .transaction("workspace")
            .objectStore("workspace")
            .get("variables");
          read.onsuccess = () => resolve(read.result);
          read.onerror = reject;
        });
      } finally {
        db.close();
      }
    });
    const rows = Object.values(variables.requests).flat();
    assert.equal(
      rows.find((row) => row.key === "saved_id").value,
      "9007199254740993",
    );
    assert.equal(
      rows.some((row) => row.key === "session_id"),
      false,
    );
    assert.equal(rows.find((row) => row.key === "access_token").value, "");
    assert.ok(!JSON.stringify(variables).includes("PRIVATE_TOKEN"));
    await page
      .getByLabel("Request URL", { exact: true })
      .fill("https://httpbin.org/get?id={{saved_id}}");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForTimeout(150);
    assert.equal(sends, 2);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: 4 MiB file import and >10 MiB rejection, precise JSON value/path copy, explicit scoped variables, overwrite guard, secret omission, targeted persistence, reuse, no automatic sends, mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
