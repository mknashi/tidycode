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
    const sent = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem("tidycode-analytics-consent", "denied");
      localStorage.setItem("privacy-banner-dismissed", "true");
    });
    for (const origin of [
      "https://httpbin.org/**",
      "https://api.example.test/**",
    ])
      await page.route(origin, async (route) => {
        const r = route.request();
        sent.push({ url: r.url(), headers: r.headers(), body: r.postData() });
        await route.fulfill({
          contentType: "application/json",
          body: '{"ok":true}',
        });
      });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
      { waitUntil: "domcontentloaded" },
    );
    await page
      .getByLabel("Request URL", { exact: true })
      .fill("{{base_url}}/anything?q={{search}}&id={{$uuid}}");
    await page
      .locator(".api-variable-error")
      .filter({ hasText: "base_url" })
      .waitFor();
    await page.getByRole("button", { name: "Variables", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Variables and environments",
    });
    await dialog.waitFor();
    const add = async (key, value) => {
      await page
        .getByRole("button", { name: "Add variable", exact: true })
        .click();
      await page.getByLabel("Variable name", { exact: true }).last().fill(key);
      await page
        .getByLabel("Variable value", { exact: true })
        .last()
        .fill(value);
    };
    await add("base_url", "https://httpbin.org");
    await add("search", "global");
    await add("token", "sentinel-secret");
    assert.equal(
      await page
        .getByLabel("Variable value", { exact: true })
        .last()
        .getAttribute("type"),
      "password",
    );
    await add("alias", "{{token}}");
    await page
      .getByRole("button", { name: "New environment", exact: true })
      .click();
    await page
      .getByLabel("Environment name", { exact: true })
      .fill("Development");
    await add("search", "dev&x=1");
    await page
      .getByRole("button", {
        name: "Save non-secret values locally",
        exact: true,
      })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page.getByLabel("Request URL", { exact: true }).inputValue(),
      "{{base_url}}/anything?q={{search}}&id={{$uuid}}",
    );
    await page.getByLabel("Request URL", { exact: true }).hover();
    assert.match(await page.getByLabel("Request URL", { exact: true }).getAttribute("title"), /Environment \(Development\) · dev&x=1/);
    await page.getByRole("button", { name: "Auth", exact: true }).click();
    await page
      .getByLabel("Authentication", { exact: true })
      .selectOption("bearer");
    await page.getByLabel("Bearer token", { exact: true }).fill("{{alias}}");
    await page.getByLabel("Bearer token", { exact: true }).hover();
    assert.match(await page.getByLabel("Bearer token", { exact: true }).getAttribute("title"), /Secret value hidden/);
    assert.ok(!(await page.getByLabel("Bearer token", { exact: true }).getAttribute("title")).includes("sentinel-secret"));

    await page.getByLabel("HTTP method", { exact: true }).selectOption("POST");
    await page.getByRole("button", { name: "Body", exact: true }).click();
    await page.getByLabel("Body type", { exact: true }).selectOption("json");
    const body = page.locator(".api-field-section .cm-content");
    await body.click();
    await page.keyboard.insertText(
      '{"query":"{{search}}","token":"{{token}}"}',
    );
    const point = await body.evaluate(node => {
      const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;
      while(text=walker.nextNode()){const index=text.textContent.indexOf('{{search}}');if(index>=0){const range=document.createRange();range.setStart(text,index+3);range.setEnd(text,index+4);const box=range.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};}}
    });
    assert.ok(point);await page.mouse.move(point.x,point.y);
    await page.locator('.cm-tooltip').filter({hasText:'Environment (Development) · dev&x=1'}).waitFor();
    await page.locator(".api-request-bar button[type=submit]").click();
    await page
      .locator(".api-status strong")
      .filter({ hasText: "200" })
      .waitFor();
    assert.equal(new URL(sent[0].url).searchParams.get("q"), "dev&x=1");
    assert.equal(new URL(sent[0].url).searchParams.has("x"), false);
    assert.equal(sent[0].headers.authorization, "Bearer sentinel-secret");
    assert.equal(JSON.parse(sent[0].body).token, "sentinel-secret");
    assert.equal(
      await page.getByLabel("Bearer token", { exact: true }).count(),
      0,
    );
    await page.locator(".api-variable-inspector summary").click();
    assert.ok(
      !(await page.locator(".api-variable-inspection").innerText()).includes(
        "sentinel-secret",
      ),
    );
    assert.match(
      await page.locator(".api-variable-inspection").innerText(),
      /Environment \(Development\)/,
    );
    assert.ok(
      !(await page.locator("body").innerText()).includes("sentinel-secret"),
    );
    // Add collection/request overrides; applying them does not implicitly save their values.
    await page
      .getByRole("button", { name: "New collection", exact: true })
      .click();
    await page
      .getByLabel("Collection name", { exact: true })
      .fill("Variable API");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await page
      .getByLabel("Request collection", { exact: true })
      .selectOption({ label: "Variable API" });
    await page.getByRole("button", { name: "Variables", exact: true }).click();
    await page
      .getByLabel("Variable scope", { exact: true })
      .selectOption("collection");
    await add("search", "collection");
    await page
      .getByLabel("Variable scope", { exact: true })
      .selectOption("request");
    await add("search", "request override");
    await page
      .getByRole("button", { name: "Apply for this session", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.locator(".api-request-bar button[type=submit]").click();
    await page
      .locator(".api-status strong")
      .filter({ hasText: "200" })
      .waitFor();
    assert.equal(
      new URL(sent[1].url).searchParams.get("q"),
      "request override",
    );
    // Switching the base origin must require destination approval, not forward auth silently.
    await page.getByRole("button", { name: "Variables", exact: true }).click();
    await page
      .getByRole("button", { name: "New environment", exact: true })
      .click();
    await page
      .getByLabel("Environment name", { exact: true })
      .fill("Production");
    await page.getByLabel("Production environment", { exact: true }).check();
    await add("base_url", "https://api.example.test");
    await page
      .getByRole("button", {
        name: "Save non-secret values locally",
        exact: true,
      })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page
        .locator('.api-client[aria-label="API Client workspace"]')
        .getAttribute("data-production"),
      "true",
    );
    await page.locator(".api-request-bar button[type=submit]").click();
    await page
      .getByRole("button", {
        name: "Approve destination for this draft",
        exact: true,
      })
      .waitFor();
    assert.equal(sent.length, 2);
    await page
      .getByRole("button", {
        name: "Approve destination for this draft",
        exact: true,
      })
      .click();
    assert.equal(sent.length, 2);
    await page.locator(".api-request-bar button[type=submit]").click();
    await page
      .locator(".api-status strong")
      .filter({ hasText: "200" })
      .waitFor();
    assert.match(sent[2].url, /api\.example\.test/);
    assert.equal(sent[2].headers.authorization, "Bearer sentinel-secret");
    assert.match(await page.locator(".api-response").innerText(), /Production/);
    await page
      .getByRole("button", { name: "Save locally", exact: true })
      .click();
    const preview = await page
      .getByLabel("Local storage preview", { exact: true })
      .inputValue();
    assert.match(preview, /base_url/);
    assert.match(preview, /alias/);
    assert.ok(!preview.includes("sentinel-secret"));
    await page
      .getByRole("button", { name: "Save reviewed template", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save API request locally" })
      .waitFor({ state: "hidden" });
    const data = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open("tidycode-api-client", 1);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(["requests", "workspace"]);
            const records = tx.objectStore("requests").getAll();
            const settings = tx.objectStore("workspace").get("variables");
            tx.oncomplete = () => {
              resolve({
                records: records.result,
                settings: settings.result,
                local: { ...localStorage },
              });
              db.close();
            };
          };
        }),
    );
    assert.ok(!JSON.stringify(data).includes("sentinel-secret"));
    assert.equal(
      data.settings.globals.find((v) => v.key === "token").value,
      "",
    );
    assert.equal(data.records[0].request.token, "{{alias}}");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Variables", exact: true })
      .waitFor();
    assert.match(
      await page.getByLabel("Request URL", { exact: true }).inputValue(),
      /base_url/,
    );
    await page
      .locator(".api-variable-error")
      .filter({ hasText: "token" })
      .waitFor();
    await page.locator(".api-request-bar button[type=submit]").click();
    await page.locator(".api-status").filter({ hasText: "token" }).waitFor();
    assert.equal(sent.length, 3);
    await page.getByRole("button", { name: "Variables", exact: true }).click();
    await page
      .getByLabel("Variable scope", { exact: true })
      .selectOption("global");
    const index = data.settings.globals.findIndex((v) => v.key === "token");
    assert.equal(
      await page
        .getByLabel("Variable value", { exact: true })
        .nth(index)
        .inputValue(),
      "",
    );
    await page
      .getByLabel("Variable value", { exact: true })
      .nth(index)
      .fill("new-session-secret");
    await page
      .getByRole("button", { name: "Apply for this session", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.locator(".api-request-bar button[type=submit]").click();
    await page
      .locator(".api-status strong")
      .filter({ hasText: "200" })
      .waitFor();
    assert.equal(sent[3].headers.authorization, "Bearer new-session-secret");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Variables", exact: true }).click();
    await dialog.waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/tidycode-api-variables-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Close variables", exact: true })
      .click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: environment CRUD/picker, four-scope precedence, encoded query expansion, transient auth/body resolution, taint masking, production label, origin approval, reference-only request persistence, secret omission/re-entry, dynamic UUID, mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
