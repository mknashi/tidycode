const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { collectionAction } = require("./api-client-ui.cjs");
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
      acceptDownloads: true,
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
      await route.abort();
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    );
    await page
      .getByLabel("Request URL", { exact: true })
      .fill("https://httpbin.org/get?api_key=SECRET_QUERY&name=Avery");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export API requests" });
    await dialog.waitFor();
    const preview = dialog.getByLabel("Export preview", { exact: true });
    assert.ok(!(await preview.inputValue()).includes("SECRET_QUERY"));
    assert.ok(!(await preview.inputValue()).includes("Avery"));
    await dialog.getByLabel("Include query values", { exact: true }).check();
    assert.ok((await preview.inputValue()).includes("Avery"));
    assert.ok(!(await preview.inputValue()).includes("SECRET_QUERY"));
    const downloaded = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Download export", exact: true })
      .click();
    const download = await downloaded;
    assert.match(download.suggestedFilename(), /\.curl\.txt$/);
    assert.equal(
      await fs.readFile(await download.path(), "utf8"),
      await preview.inputValue(),
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Import requests", exact: true })
      .click();
    const sample = await fs.readFile(
      "examples/api-client/httpbin-playground.postman_collection.json",
      "utf8",
    );
    await page.getByLabel("Import content", { exact: true }).fill(sample);
    await page
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Import as new collection", exact: true })
      .click();
    await collectionAction(
      page,
      "httpbin Playground",
      "Export collection httpbin Playground",
    );
    await dialog.waitFor();
    const doc = JSON.parse(await preview.inputValue());
    assert.equal(doc.info.name, "httpbin Playground");
    assert.equal(doc.item.length, 4);
    assert.equal(
      await dialog.getByLabel("Export format").inputValue(),
      "postman",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal(sends, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: request export review/default omissions, recognized query credential removal, exact download, modal Escape, collection export, mobile overflow, no automatic sends",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
