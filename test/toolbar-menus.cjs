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
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem("tidycode-analytics-consent", "denied");
      localStorage.setItem("privacy-banner-dismissed", "true");
    });
    await page.goto(process.env.APP_URL || "http://127.0.0.1:5193/");
    await page
      .locator("#file-input")
      .setInputFiles({
        name: "menu-test.json",
        mimeType: "application/json",
        buffer: Buffer.from('{"name":"Avery","count":2}'),
      });
    await page
      .locator("[data-tab-item]")
      .filter({ hasText: "menu-test.json" })
      .waitFor();
    const convert = page.getByRole("button", {
        name: "Convert document",
        exact: true,
      }),
      conversion = page.getByRole("menu", {
        name: "Document conversion",
        exact: true,
      });
    await convert.click();
    await conversion.waitFor();
    assert.ok(
      await conversion.evaluate((node) => node.parentElement === document.body),
    );
    assert.ok(
      await conversion.evaluate((node) => {
        const b = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(b.x + 30, b.y + 50));
      }),
    );
    await conversion
      .getByRole("menuitem", { name: "Convert to YAML", exact: true })
      .click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".cm-content")].some((node) =>
        /name:\s*Avery/.test(node.textContent),
      ),
    );
    const trigger = page.getByTitle("AI Actions & Settings", { exact: true }),
      ai = page.getByRole("menu", {
        name: "AI actions and settings",
        exact: true,
      });
    await trigger.click();
    await ai.waitFor();
    assert.ok(
      await ai.evaluate((node) => node.parentElement === document.body),
    );
    await ai
      .getByRole("menuitem", { name: "AI Settings", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "AI Settings", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Close AI Settings", exact: true })
      .click();
    await trigger.click();
    await page.keyboard.press("Escape");
    await ai.waitFor({ state: "hidden" });
    assert.ok(
      await trigger.evaluate((node) => document.activeElement === node),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await convert.click();
    await conversion.waitFor();
    let box = await conversion.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390);
    await page.keyboard.press("Escape");
    await trigger.click();
    await ai.waitFor();
    box = await ai.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390);
    await ai
      .getByRole("menuitem", { name: "AI Settings", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "AI Settings", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: portaled Convert/AI menus, actual YAML conversion, AI Settings opens, Escape focus, narrow-screen geometry",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
