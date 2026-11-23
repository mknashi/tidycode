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
    let sends = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem("tidycode-analytics-consent", "denied");
      localStorage.setItem("privacy-banner-dismissed", "true");
    });
    await page.route("https://httpbin.org/**", (r) => {
      sends++;
      return r.fulfill({ contentType: "application/json", body: "{}" });
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    );
    await page
      .getByRole("button", { name: "Code", exact: true })
      .first()
      .click();
    const source =
      '@base=https://httpbin.org\n### Create\nPOST {{base}}/anything\nAuthorization: Bearer {{token}}\nContent-Type: application/json\n\n{"name":"ORIGINAL_PRIVATE"}\n\n### Read\nGET {{base}}/get?keep=yes\n';
    await page
      .locator("#file-input")
      .setInputFiles({
        name: "test-data.rest",
        mimeType: "text/plain",
        buffer: Buffer.from(source),
      });
    const outline = page.getByRole("region", {
      name: "HTTP request outline",
      exact: true,
    });
    await outline.waitFor();
    const editor = page.locator(".cm-content:visible").first();
    await outline
      .getByRole("button", {
        name: "Actions for HTTP request Create",
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", { name: "Generate body data…", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.ok(
      !(await dialog.getByLabel("Test data schema").inputValue()).includes(
        "ORIGINAL_PRIVATE",
      ),
    );
    await dialog
      .getByLabel("Test data schema")
      .fill(
        '{"type":"object","properties":{"id":{"type":"integer","minimum":7,"maximum":7}}}',
      );
    await dialog
      .getByRole("button", { name: "Generate preview", exact: true })
      .click();
    assert.match(await editor.innerText(), /ORIGINAL_PRIVATE/);
    await dialog
      .getByRole("button", { name: "Apply to JSON body", exact: true })
      .click();
    await page.waitForTimeout(100);
    let text = await editor.innerText();
    assert.match(text, /"id": 7/);
    assert.match(text, /Authorization: Bearer \{\{token\}\}/);
    assert.ok(text.includes("GET {{base}}/get?keep=yes"));
    await editor.focus();
    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(100);
    assert.match(await editor.innerText(), /ORIGINAL_PRIVATE/);
    await outline
      .getByRole("button", {
        name: "Actions for HTTP request Read",
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", { name: "Generate query data…", exact: true })
      .click();
    await dialog
      .getByLabel("Test data schema")
      .fill(
        '{"type":"object","properties":{"page":{"type":"integer","minimum":2,"maximum":2}}}',
      );
    await dialog
      .getByRole("button", { name: "Generate preview", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Apply to query parameters", exact: true })
      .click();
    await page.waitForTimeout(100);
    assert.match(await editor.innerText(), /keep=yes&page=2/);
    await editor.click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Generate body data…", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(sends, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: .rest source generation from outline and context menu, preview privacy, targeted body and query edits, preserved headers/declarations/neighbors, Undo, no sends",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
