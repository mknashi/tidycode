const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { collectionAction, openSection } = require("./api-client-ui.cjs");
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
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
      { waitUntil: "domcontentloaded" },
    );
    const divider = page.getByRole("separator", {
      name: "Resize API sidebar",
      exact: true,
    });
    await divider.waitFor();
    assert.equal(
      Math.round((await page.locator(".api-sidebar").boundingBox()).width),
      280,
    );
    await divider.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await divider.getAttribute("aria-valuenow"), "296");
    const rect = await divider.boundingBox();
    await page.mouse.move(rect.x + 3, rect.y + 120);
    await page.mouse.down();
    await page.mouse.move(rect.x + 100, rect.y + 120);
    await page.mouse.up();
    const width = Number(await divider.getAttribute("aria-valuenow"));
    assert.ok(width > 350 && width <= 480);
    await page.reload({ waitUntil: "domcontentloaded" });
    await divider.waitFor();
    assert.equal(Number(await divider.getAttribute("aria-valuenow")), width);
    await divider.dblclick();
    assert.equal(await divider.getAttribute("aria-valuenow"), "280");
    // Save an unfiled request and confirm its section can collapse without duplicate rows.
    await page
      .getByRole("button", { name: "Save locally", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save reviewed template", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save API request locally" })
      .waitFor({ state: "hidden" });
    const saved = page.locator(".api-sidebar-disclosure").filter({
      has: page
        .locator(":scope > summary")
        .filter({ hasText: "Saved locally" }),
    });
    assert.equal(await saved.evaluate((el) => el.open), false);
    await openSection(page, "Saved locally");
    assert.match(await saved.innerText(), /First request/);
    await saved.locator(":scope > summary").click();
    assert.equal(await saved.evaluate((el) => el.open), false);
    await page.reload({ waitUntil: "domcontentloaded" });
    await divider.waitFor();
    assert.equal(await saved.evaluate((el) => el.open), false);
    // Import sample tree, keep only the active branch expanded, and expose actions on demand.
    await page
      .getByRole("button", { name: "Import requests", exact: true })
      .click();
    await page
      .getByLabel("Import content", { exact: true })
      .fill(
        fs.readFileSync(
          "examples/api-client/httpbin-playground.postman_collection.json",
          "utf8",
        ),
      );
    await page
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Import as new collection", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Import API requests" })
      .waitFor({ state: "hidden" });
    const collection = page.locator(".api-collection").filter({
      has: page
        .locator(":scope > summary")
        .filter({ hasText: "httpbin Playground" }),
    });
    assert.equal(await collection.evaluate((el) => el.open), true);
    const folders = await collection.locator(".api-folder").all();
    assert.equal(await folders[0].evaluate((el) => el.open), true);
    assert.equal(await folders[1].evaluate((el) => el.open), false);
    // Reselecting an active request reveals collapsed ancestors; manual collapse still works.
    await folders[0].locator(":scope > summary").click();
    assert.equal(await folders[0].evaluate((el) => el.open), false);
    await collection.locator(":scope > summary").click();
    assert.equal(await collection.evaluate((el) => el.open), false);
    await page.locator('.api-tab[data-active="true"] button').first().click();
    await page.waitForFunction(
      () =>
        document.querySelector(".api-collection")?.open &&
        document.querySelector(".api-folder")?.open,
    );
    assert.equal(await collection.evaluate((el) => el.open), true);
    assert.equal(await folders[0].evaluate((el) => el.open), true);
    assert.equal(await folders[1].evaluate((el) => el.open), false);
    assert.equal(await page.getByRole("menuitem").count(), 0);
    await page
      .getByRole("button", {
        name: "Collection actions for httpbin Playground",
        exact: true,
      })
      .click();
    const menu = page.getByRole("menu", {
      name: "Collection actions",
      exact: true,
    });
    await menu.waitFor();
    assert.equal(await menu.getByRole("menuitem").count(), 7);
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute("role")),
      "menuitem",
    );
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      ),
      "Collection actions for httpbin Playground",
    );
    await collectionAction(
      page,
      "httpbin Playground",
      "Rename collection httpbin Playground",
    );
    await page
      .getByLabel("Collection name", { exact: true })
      .fill("Playground renamed");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Collection actions for Playground renamed",
        exact: true,
      })
      .waitFor();
    // Collection requests must also appear under Saved locally and survive reload.
    await openSection(page, "Saved locally");
    assert.match(await saved.innerText(), /GET query parameters/);
    assert.equal(await saved.locator(".api-saved-row").count(), 8);
    await page.reload({ waitUntil: "domcontentloaded" });
    await divider.waitFor();
    await openSection(page, "Saved locally");
    assert.match(await saved.innerText(), /GET query parameters/);
    assert.equal(await saved.locator(".api-saved-row").count(), 8);
    await saved.locator(":scope > summary").click();
    // Search expands matching branches and full request names remain accessible.
    await page
      .getByLabel("Find API requests", { exact: true })
      .fill("POST JSON");
    await page
      .getByRole("button", {
        name: /POSTPOST JSON customer|POST POST JSON customer/,
      })
      .waitFor();
    await page.getByLabel("Find API requests", { exact: true }).fill("");
    await page.screenshot({
      path: "/tmp/tidycode-api-sidebar-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await divider.isVisible(), false);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(
      Math.round((await page.locator(".api-sidebar").boundingBox()).width),
      390,
    );
    await page.screenshot({
      path: "/tmp/tidycode-api-sidebar-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: sidebar pointer/keyboard resize, width persistence/reset, collapsible saved/history/storage sections, saved-row deduplication, active-branch tree, action popovers, keyboard menu, rename, search, responsive mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
