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
    let calls = 0;
    await page.route("https://httpbin.org/**", async (route) => {
      calls++;
      await route.fulfill({
        status: calls === 1 ? 200 : 201,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Expose-Headers": "X-Version",
          "X-Version": calls === 1 ? "old" : "new",
        },
        body: JSON.stringify(
          {
            id: 1,
            name: calls === 1 ? "Avery" : "Updated",
            nested: { count: calls },
          },
          null,
          2,
        ),
      });
    });
    await page.goto(
      process.env.API_CLIENT_URL || "http://127.0.0.1:5193/?tool=api",
    );
    const response = page.getByRole("region", {
      name: "API response",
      exact: true,
    });
    const compare = response.getByRole("button", {
      name: "Compare",
      exact: true,
    });
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await compare.waitFor();
    await compare.click();
    await page
      .getByText("Save a response snapshot first:", { exact: false })
      .waitFor();
    await page
      .getByRole("button", { name: "Save locally", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save reviewed template", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save API request locally" })
      .waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText("Changes found in body.", { exact: true }).waitFor();
    const comparison = page.getByLabel("Response comparison", { exact: true });
    assert.match(await comparison.innerText(), /Status: 200 → 201/);
    await comparison
      .getByText("Changed JSON paths (2)", { exact: true })
      .click();
    assert.match(await comparison.innerText(), /\/name/);
    assert.match(await comparison.innerText(), /\/nested\/count/);
    await comparison
      .getByRole("button", { name: "Next change", exact: true })
      .click();
    assert.match(await comparison.innerText(), /1 \/ /);
    assert.match(
      await comparison
        .getByLabel("Response differences", { exact: true })
        .innerText(),
      /Avery/,
    );
    assert.match(
      await comparison
        .getByLabel("Response differences", { exact: true })
        .innerText(),
      /Updated/,
    );
    const baseline = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("tidycode-api-client", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = reject;
      });
      try {
        return await new Promise((resolve, reject) => {
          const read = db
            .transaction("requests")
            .objectStore("requests")
            .getAll();
          read.onsuccess = () => resolve(read.result[0].response);
          read.onerror = reject;
        });
      } finally {
        db.close();
      }
    });
    assert.match(
      Buffer.from(baseline.bodyBase64, "base64").toString(),
      /Avery/,
    );
    await comparison.getByLabel("Comparison section").selectOption("headers");
    await page
      .getByText("Changes found in headers.", { exact: true })
      .waitFor();
    assert.match(await comparison.innerText(), /x-version: old/);
    assert.match(await comparison.innerText(), /x-version: new/);
    await page.screenshot({
      path: "/tmp/tidycode-api-comparison.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.reload();
    await page.getByRole("tab", { name: /^Response/ }).click();
    await compare.click();
    await page
      .getByText(
        "Send this request to compare a fresh response with the saved snapshot.",
        { exact: true },
      )
      .waitFor();
    assert.equal(calls, 2);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: missing baseline guidance, saved/live body+header comparison, JSON paths, change navigation, original snapshot retention, mobile overflow, reload snapshot guidance, no automatic sends",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
