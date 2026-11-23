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
      errors = [],
      downloads = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("download", (download) => downloads.push(download));
    await page.addInitScript(() => {
      localStorage.setItem("tidycode-analytics-consent", "denied");
      localStorage.setItem("privacy-banner-dismissed", "true");
      window.savePickerCalls = 0;
      window.showSaveFilePicker = async () => {
        window.savePickerCalls++;
        throw new DOMException("Cancelled for test", "AbortError");
      };
    });
    await page.goto(process.env.APP_URL || "http://127.0.0.1:5193/");
    await page
      .locator("#file-input")
      .setInputFiles({
        name: "save-menu.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Original document"),
      });
    const editor = page.locator(".cm-content:visible").first();
    await editor.click();
    await page.keyboard.press("Meta+End");
    await page.keyboard.insertText(" modified");
    const trigger = page.getByTitle("Save options", { exact: true }),
      menu = page.getByRole("menu", { name: "Save options", exact: true });
    await trigger.click();
    await menu.waitFor();
    assert.ok(
      await menu.evaluate((node) => node.parentElement === document.body),
    );
    const box = await menu.boundingBox();
    assert.ok(box.y > 20 && box.x >= 0 && box.x + box.width <= 1440);
    assert.ok(
      await menu.evaluate((node) => {
        const b = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        );
      }),
    );
    await page.screenshot({
      path: "/tmp/tidycode-save-menu-desktop.png",
      fullPage: true,
    });
    await menu
      .getByRole("menuitem", { name: "Save As...", exact: false })
      .click();
    await page.waitForFunction(() => window.savePickerCalls === 1);
    await menu.waitFor({ state: "hidden" });
    await trigger.click();
    await menu.getByRole("menuitem", { name: /^Save\s+⌘S$/ }).click();
    await page.waitForFunction(() => window.savePickerCalls === 2);
    await trigger.click();
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    assert.ok(
      await trigger.evaluate((node) => document.activeElement === node),
    );
    await trigger.click();
    await editor.click();
    await menu.waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    await menu.waitFor();
    const small = await menu.boundingBox();
    assert.ok(small.x >= 0 && small.x + small.width <= 390);
    assert.ok(
      await menu.evaluate((node) => {
        const b = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        );
      }),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    assert.equal(downloads.length, 0);
    console.log(
      "PASS: Save menu escapes toolbar clipping, Save and Save As invoke picker, Escape restores focus, outside click dismisses, narrow layout visible",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
