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
    const sent = [];
    await page.route("https://httpbin.org/**", async (route) => {
      sent.push({
        method: route.request().method(),
        body: route.request().postData(),
      });
      await route.fulfill({
        contentType: "application/json",
        body: '{"ok":true}',
      });
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    );
    const code = () =>
      page.getByRole("button", { name: "Code", exact: true }).first().click();
    await code();
    const source =
      '### List users\nGET https://httpbin.org/get\nAccept: application/json\n\n### Create user\nPOST https://httpbin.org/anything\nContent-Type: application/json\n\n{"name":"Avery"}';
    await page.locator("#file-input").setInputFiles({
      name: "outline.http",
      mimeType: "text/plain",
      buffer: Buffer.from(source),
    });
    const outline = page.getByRole("region", {
      name: "HTTP request outline",
      exact: true,
    });
    await outline.waitFor();
    assert.equal(
      await page.getByLabel("Format document", { exact: true }).isDisabled(),
      false,
    );
    assert.equal(
      await page
        .getByText("No structure detected", { exact: true })
        .isVisible(),
      false,
    );
    assert.equal(
      await outline
        .getByRole("button", { name: /^Go to HTTP request/ })
        .count(),
      2,
    );
    await outline
      .getByRole("button", {
        name: "Go to HTTP request Create user",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="Go to HTTP request Create user"]')
          ?.getAttribute("aria-current") === "true",
    );
    assert.equal(sent.length, 0);
    const editor = page.locator(".cm-content:visible").first();
    const original = await editor.innerText();
    await outline
      .getByRole("button", {
        name: "Open HTTP request List users",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Request name"]')?.value ===
        "List users",
    );
    assert.equal(sent.length, 0);
    await code();
    assert.equal(await editor.innerText(), original);
    await outline
      .getByRole("button", {
        name: "Go to HTTP request List users",
        exact: true,
      })
      .click();
    await outline
      .getByRole("button", {
        name: "Send HTTP request Create user",
        exact: true,
      })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector('[aria-label="HTTP editor response"]')
        ?.textContent.includes("200"),
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, "POST");
    assert.equal(sent[0].body, '{"name":"Avery"}');
    await code();
    assert.equal(await editor.innerText(), original);
    await outline.getByLabel("Find HTTP requests in file").fill("Create");
    assert.equal(
      await outline
        .getByRole("button", { name: /^Go to HTTP request/ })
        .count(),
      1,
    );
    await outline.getByLabel("Find HTTP requests in file").fill("");
    await page.screenshot({
      path: "/tmp/tidycode-http-outline-desktop.png",
      fullPage: true,
    });
    await outline
      .getByRole("button", { name: "Insert HTTP request", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="Go to HTTP request New request"]')
          ?.getAttribute("aria-current") === "true",
    );
    assert.match(await editor.innerText(), /GET \{\{base_url\}\}\/path/);
    assert.equal(sent.length, 1);
    await outline.getByRole("button", { name: "Delete HTTP request New request", exact: true }).click();
    assert.equal(await outline.getByRole("button", { name: "Go to HTTP request New request", exact: true }).count(), 0);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
    await page.waitForSelector('[aria-label="Go to HTTP request New request"]');
    assert.match(await editor.innerText(), /GET \{\{base_url\}\}\/path/);
    await page.setViewportSize({ width: 390, height: 844 });
    // Fresh mobile loads hide the tab explorer; close it here after resizing the desktop session.
    const closeExplorer = page.getByTitle("Close Explorer", { exact: true });
    if (await closeExplorer.isVisible()) await closeExplorer.click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: "/tmp/tidycode-batch-mobile-debug.png", fullPage: true });
    const bounds = await outline.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, JSON.stringify(await outline.evaluate(node=>{const rows=[];for(let el=node;el;el=el.parentElement)rows.push({tag:el.tagName,cls:el.className,x:el.getBoundingClientRect().x,width:el.getBoundingClientRect().width,scroll:el.scrollLeft,scrollWidth:el.scrollWidth});return rows;})));
    const editorBounds = await editor.boundingBox();
    assert.ok(editorBounds.width > 150);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/tidycode-http-outline-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: HTTP replaces blank structure, outline navigation/highlight, explicit row open/send targets, source retention, search, editable insert without send, mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
