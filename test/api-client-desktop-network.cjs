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
        viewport: { width: 1440, height: 1100 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      (process.env.API_CLIENT_BASE_URL || "http://127.0.0.1:5193") +
        "/test/desktop-vault.html?workspace=1",
    );
    const workspace = page.getByLabel("API Client workspace", { exact: true });
    await workspace
      .locator(".api-transport")
      .filter({ hasText: "Desktop" })
      .waitFor();
    await workspace
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    const settings = page.getByRole("region", {
      name: "Desktop TLS and proxy settings",
    });
    await settings.waitFor();
    assert.equal(
      await settings
        .getByLabel("Verify TLS certificates", { exact: true })
        .isChecked(),
      true,
    );
    await settings
      .getByLabel("Verify TLS certificates", { exact: true })
      .uncheck();
    await settings
      .getByRole("button", {
        name: "Apply desktop network settings",
        exact: true,
      })
      .click();
    await settings
      .getByRole("alert")
      .filter({ hasText: /approve/ })
      .waitFor();
    assert.equal(await page.evaluate(() => window.nativeRequests.length), 0);
    await settings
      .getByLabel("Approve desktop network settings", { exact: true })
      .check();
    await settings
      .getByRole("button", {
        name: "Apply desktop network settings",
        exact: true,
      })
      .click();
    await settings.getByText(/settings applied for this request/).waitFor();
    await workspace.locator(".api-request-bar button[type=submit]").click();
    await workspace
      .locator(".api-status strong")
      .filter({ hasText: "200" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => window.nativeRequests.at(-1).network.verifyTls),
      false,
    );
    await workspace
      .getByLabel("Request URL", { exact: true })
      .fill("https://example.test/changed");
    assert.equal(
      await settings
        .getByLabel("Approve desktop network settings", { exact: true })
        .isChecked(),
      false,
    );
    const before = await page.evaluate(() => window.nativeRequests.length);
    await workspace.locator(".api-request-bar button[type=submit]").click();
    await workspace
      .getByText(/destination changed/i)
      .first()
      .waitFor();
    assert.equal(
      await page.evaluate(() => window.nativeRequests.length),
      before,
    );
    await workspace
      .getByRole("button", { name: /Approve.*destination/i })
      .click();
    await settings
      .getByRole("button", { name: "Reset network settings", exact: true })
      .click();
    await settings
      .getByLabel("Desktop proxy URL")
      .fill("http://127.0.0.1:8888");
    await settings.getByLabel("Desktop proxy username").fill("synthetic-user");
    await settings
      .getByLabel("Desktop proxy password")
      .fill("SYNTHETIC_PROXY_SECRET");
    assert.equal(
      await settings.getByLabel("Desktop proxy password").getAttribute("type"),
      "password",
    );
    await settings
      .getByRole("button", { name: "Show proxy password", exact: true })
      .click();
    assert.equal(
      await settings.getByLabel("Desktop proxy password").getAttribute("type"),
      "text",
    );
    await settings
      .getByRole("button", { name: "Hide proxy password", exact: true })
      .click();
    await settings
      .getByLabel("Approve desktop network settings", { exact: true })
      .check();
    await settings
      .getByRole("button", {
        name: "Apply desktop network settings",
        exact: true,
      })
      .click();
    await settings.getByText(/settings applied for this request/).waitFor();
    await workspace.locator(".api-request-bar button[type=submit]").click();
    await page.waitForFunction(
      (count) => window.nativeRequests.length > count,
      before,
    );
    assert.equal(
      await page.evaluate(
        () => window.nativeRequests.at(-1).network.proxyPassword,
      ),
      "SYNTHETIC_PROXY_SECRET",
    );
    await workspace
      .getByRole("button", { name: "Duplicate", exact: true })
      .click();
    await workspace
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    assert.equal(
      await settings
        .getByLabel("Verify TLS certificates", { exact: true })
        .isChecked(),
      true,
    );
    assert.equal(
      await settings.getByLabel("Desktop proxy URL").inputValue(),
      "",
    );
    await settings
      .getByLabel("Custom CA certificate file")
      .setInputFiles({
        name: "private.pem",
        mimeType: "text/plain",
        buffer: Buffer.from(
          "-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----",
        ),
      });
    await settings.getByRole("alert").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await workspace.getByRole("tab", { name: "Request", exact: true }).click();
    await settings.scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/tidycode-desktop-network-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: desktop TLS/proxy defaults, approval, destination-change guard, session proxy auth/masking, private-key rejection, duplicate reset, mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
