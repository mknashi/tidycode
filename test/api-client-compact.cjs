const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { openSection } = require("./api-client-ui.cjs");
(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
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
      .getByRole("button", { name: "New API request", exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator(".api-sidebar")
        .getByRole("button", { name: "New API request", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator(".api-tabs-bar")
        .getByRole("button", { name: "New API request", exact: true })
        .count(),
      1,
    );
    assert.equal(await page.locator(".api-drafts-heading").count(), 0);
    await openSection(page, "Environments");
    await page
      .getByRole("button", { name: "Create environment", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Variables and environments",
    });
    await dialog.waitFor();
    assert.match(
      await page.getByLabel("Environment name", { exact: true }).inputValue(),
      /Environment/,
    );
    await page.getByLabel("Environment name", { exact: true }).fill("Practice");
    await page
      .getByRole("button", {
        name: "Save non-secret values locally",
        exact: true,
      })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByRole("button", { name: "Use environment Practice", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    // Per-environment menu: manage the selected scope, copy through review, delete only that copy.
    await page.getByRole("button", { name: "Environment actions for Practice", exact: true }).click();
    await page.getByRole("menuitem", { name: "Manage", exact: true }).click();
    await dialog.waitFor();
    assert.equal(await page.getByLabel("Environment name", { exact: true }).inputValue(), "Practice");
    await page.getByRole("button", { name: "Close variables", exact: true }).click();
    await page.getByRole("button", { name: "Environment actions for Practice", exact: true }).click();
    await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
    await dialog.waitFor();
    assert.equal(await page.getByLabel("Environment name", { exact: true }).inputValue(), "Practice copy");
    await page.getByRole("button", { name: "Save non-secret values locally", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Environment actions for Practice copy", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Use environment Practice copy", exact: true }).waitFor({ state: "detached" });
    assert.equal(await page.getByLabel("Active environment", { exact: true }).inputValue(), "");
    assert.equal(await page.getByRole("button", { name: "Use environment Practice", exact: true }).count(), 1);
    await page
      .getByRole("button", { name: "Use no environment", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Active environment", { exact: true }).inputValue(),
      "",
    );
    await page
      .getByRole("button", { name: "Manage environments", exact: true })
      .click();
    await dialog.waitFor();
    await page
      .getByRole("button", { name: "Close variables", exact: true })
      .click();
    // Metadata controls and actions should occupy one aligned toolbar on a wide screen.
    const name = await page
      .getByLabel("Request name", { exact: true })
      .boundingBox();
    const collection = await page
      .getByLabel("Request collection", { exact: true })
      .boundingBox();
    assert.ok(Math.abs(name.y - collection.y) < 3);
    const save = await page
      .getByRole("button", { name: "Save locally", exact: true })
      .boundingBox();
    const duplicate = await page
      .getByRole("button", { name: "Duplicate", exact: true })
      .boundingBox();
    assert.ok(Math.abs(save.y - duplicate.y) < 3);
    assert.ok(save.x - duplicate.x < 150);
    // Many tabs stay on one horizontal strip with a separate, reachable New button.
    for (let i = 0; i < 9; i++) {
      await page
        .getByRole("button", { name: "New API request", exact: true })
        .click();
      await page
        .getByLabel("Request name", { exact: true })
        .fill("Request with a descriptive title " + i);
    }
    const boxes = await page
      .locator(".api-tab")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    assert.ok(Math.max(...boxes) - Math.min(...boxes) < 2);
    assert.equal(
      await page
        .getByRole("button", { name: "New API request", exact: true })
        .isVisible(),
      true,
    );
    const panes = await page.locator(".api-panes").boundingBox();
    assert.ok(
      panes.y < 400,
      `Request/response area starts too low: ${panes.y}`,
    );
    assert.equal(await page.locator(".api-layout-toolbar").isVisible(), true);
    assert.equal(await page.locator(".api-layout-toolbar").getByLabel("API layout").count(), 1);
    await page.getByRole("button", { name: "First request tab", exact: true }).click();
    assert.equal(await page.getByLabel("Request name", { exact: true }).inputValue(), "First request");
    await page.getByRole("button", { name: "Last request tab", exact: true }).click();
    assert.equal(await page.getByLabel("Request name", { exact: true }).inputValue(), "Request with a descriptive title 8");
    await page.locator('.api-tab[data-active="true"] button').first().press("Home");
    assert.equal(await page.getByLabel("Request name", { exact: true }).inputValue(), "First request");
    await page.locator('.api-tab[data-active="true"] button').first().press("ArrowRight");
    assert.equal(await page.getByLabel("Request name", { exact: true }).inputValue(), "Request with a descriptive title 0");
    const source = page.locator('.api-tab').nth(1);
    const target = page.locator('.api-tab').first();
    await source.dragTo(target);
    assert.match(await page.locator('.api-tab').first().innerText(), /descriptive title 0/);
    await page.getByLabel("API layout").selectOption("tabs");
    const tabsBox = await page.getByRole("tablist", { name: "Request and response" }).boundingBox();
    const layoutBox = await page.getByLabel("API layout").boundingBox();
    assert.ok(layoutBox.x > tabsBox.x + tabsBox.width);
    assert.ok(Math.abs(layoutBox.y - tabsBox.y) < 25);
    await page.screenshot({
      path: "/tmp/tidycode-api-compact-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "New API request", exact: true })
        .isVisible(),
      true,
    );
    assert.equal(
      await page.getByLabel("Active environment", { exact: true }).isVisible(),
      true,
    );
    await page.screenshot({
      path: "/tmp/tidycode-api-compact-mobile.png",
      fullPage: true,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Use environment Practice", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 1600, height: 1000 });
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "New API request", exact: true }).click();
      await page.getByLabel("Request name", { exact: true }).fill(`Close test ${i}`);
    }
    await page.locator(".api-tab").nth(1).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Close to the Right", exact: true }).click();
    assert.equal(await page.locator(".api-tab").count(), 2);
    await page.getByRole("button", { name: "Request tab actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Close Others", exact: true }).click();
    assert.equal(await page.locator(".api-tab").count(), 1);
    await page.getByRole("button", { name: "New API request", exact: true }).click();
    await page.getByRole("button", { name: "Request tab actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Close", exact: true }).click();
    assert.equal(await page.locator(".api-tab").count(), 1);
    await page.getByRole("button", { name: "Request tab actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Close All", exact: true }).click();
    assert.equal(await page.locator(".api-tab").count(), 1);
    assert.equal(await page.getByLabel("Request name", { exact: true }).inputValue(), "Untitled request");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: tab-bar creation, collapsible environments, create/manage/select flows, aligned metadata/actions, single-line scrolling tabs, compact panel position, mobile overflow, section persistence",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
