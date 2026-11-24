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
        viewport: { width: 1200, height: 1000 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      (process.env.API_CLIENT_BASE_URL || "http://127.0.0.1:5193") +
        "/test/desktop-vault.html",
    );
    const variables = page.getByRole("dialog", {
        name: "Variables and environments",
      }),
      vault = page.getByRole("dialog", { name: "Desktop credential vault" });
    await variables
      .getByRole("button", { name: "Add variable", exact: true })
      .click();
    await variables
      .getByLabel("Variable name", { exact: true })
      .fill("client_secret");
    await variables
      .getByLabel("Variable value", { exact: true })
      .fill("SYNTHETIC_VAULT_SECRET");
    const showSecret=variables.getByRole('button',{name:'Show secret value',exact:true});
    assert.equal(await showSecret.innerText(),'');await showSecret.click();
    assert.equal(await variables.getByLabel('Variable value',{exact:true}).getAttribute('type'),'text');
    await variables.getByRole('button',{name:'Hide secret value',exact:true}).click();
    assert.equal(await variables.getByLabel('Variable value',{exact:true}).getAttribute('type'),'password');

    await variables
      .getByRole("button", { name: "Vault for client_secret", exact: true })
      .click();
    await vault.waitFor();
    assert.equal(
      await vault.getByLabel("Vault credential value").getAttribute("type"),
      "password",
    );
    await vault
      .getByRole("button", { name: "Save to OS vault", exact: true })
      .click();
    await vault.getByText(/Credential saved in the OS store/).waitFor();
    assert.equal(await page.evaluate(() => window.secretCount()), 1);
    assert.equal(
      await page.evaluate(() =>
        window.vaultCalls.some((c) => c.command === "api_vault_get"),
      ),
      false,
    );
    assert.ok(
      !(
        await page.evaluate(() => JSON.stringify({ ...localStorage }))
      ).includes("SYNTHETIC_VAULT_SECRET"),
    );
    await vault
      .getByRole("button", { name: "Close credential vault", exact: true })
      .click();
    await variables
      .getByRole("button", {
        name: "Save non-secret values locally",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Open variables", exact: true })
      .click();
    assert.equal(
      await variables
        .getByLabel("Variable value", { exact: true })
        .inputValue(),
      "",
    );
    await variables
      .getByRole("button", { name: "Vault for client_secret", exact: true })
      .click();
    await vault
      .getByLabel("Saved credential")
      .selectOption({ label: "client_secret" });
    assert.equal(
      await vault.getByLabel("Vault credential value").inputValue(),
      "",
    );
    await vault
      .getByRole("button", { name: "Use in this variable", exact: true })
      .click();
    await vault.waitFor({ state: "hidden" });
    assert.equal(await variables.getByRole('button',{name:'Vault for client_secret',exact:true}).getAttribute('data-vault-linked'),'true');
    assert.match(await variables.getByRole('button',{name:'Vault for client_secret',exact:true}).getAttribute('title'),/Linked to vault: client_secret/);
    assert.equal(await variables.getByRole('button',{name:'Vault for client_secret',exact:true}).locator('svg').count(),1);
    assert.equal(
      await variables
        .getByLabel("Variable value", { exact: true })
        .inputValue(),
      "SYNTHETIC_VAULT_SECRET",
    );
    assert.equal(
      await variables
        .getByLabel("Variable value", { exact: true })
        .getAttribute("type"),
      "password",
    );
    // Switching entries must update the association, including after saving/reopening Variables.
    await variables
      .getByRole("button", { name: "Vault for client_secret", exact: true })
      .click();
    assert.equal(
      await vault
        .getByLabel("Saved credential")
        .evaluate((node) => node.selectedOptions[0].textContent),
      "client_secret",
    );
    await vault.getByLabel("Saved credential").selectOption("");
    await vault.getByLabel("Vault credential name").fill("Second credential");
    await vault
      .getByLabel("Vault credential value")
      .fill("SECOND_SYNTHETIC_SECRET");
    await vault
      .getByRole("button", { name: "Save to OS vault", exact: true })
      .click();
    await vault.getByText(/Credential saved in the OS store/).waitFor();
    await vault
      .getByRole("button", { name: "Use in this variable", exact: true })
      .click();
    await vault.waitFor({ state: "hidden" });
    assert.equal(
      await variables
        .getByLabel("Variable value", { exact: true })
        .inputValue(),
      "SECOND_SYNTHETIC_SECRET",
    );
    await variables
      .getByRole("button", {
        name: "Save non-secret values locally",
        exact: true,
      })
      .click();
    assert.match(await page.evaluate(()=>JSON.parse(localStorage.getItem('tidycode-api-vault-index-v1')).find(row=>row.name==='Second credential').name),/Second credential/);
    const reads = await page.evaluate(
      () =>
        window.vaultCalls.filter((c) => c.command === "api_vault_get").length,
    );
    await page
      .getByRole("button", { name: "Open variables", exact: true })
      .click();
    assert.equal(
      await variables
        .getByLabel("Variable value", { exact: true })
        .inputValue(),
      "",
    );
    await variables
      .getByRole("button", { name: "Vault for client_secret", exact: true })
      .click();
    assert.ok(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("fixture-variable-settings"))
            .globals[0].vaultId,
      ),
    );
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Saved credential"]')
          ?.selectedOptions[0]?.textContent === "Second credential",
    );
    assert.equal(
      await vault
        .getByLabel("Saved credential")
        .evaluate((node) => node.selectedOptions[0].textContent),
      "Second credential",
    );
    assert.equal(
      await vault.getByLabel("Vault credential name").inputValue(),
      "Second credential",
    );
    assert.equal(
      await vault.getByLabel("Vault credential value").inputValue(),
      "",
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.vaultCalls.filter((c) => c.command === "api_vault_get").length,
      ),
      reads,
    );
    await vault
      .getByLabel("Delete the selected credential from the OS vault", {
        exact: true,
      })
      .check();
    await vault
      .getByRole("button", { name: "Delete OS credential", exact: true })
      .click();
    await vault.getByText(/Removed from the OS vault/).waitFor();
    await vault
      .getByRole("button", { name: "Close credential vault", exact: true })
      .click();
    await variables
      .getByRole("button", { name: "Vault for client_secret", exact: true })
      .click();
    await vault
      .getByLabel("Saved credential")
      .selectOption({ label: "client_secret" });
    assert.equal(
      await vault
        .getByRole("button", { name: "Delete OS credential", exact: true })
        .isEnabled(),
      false,
    );
    await vault
      .getByLabel("Delete the selected credential from the OS vault", {
        exact: true,
      })
      .check();
    await vault
      .getByRole("button", { name: "Delete OS credential", exact: true })
      .click();
    await vault.getByText(/Removed from the OS vault/).waitFor();
    assert.equal(await page.evaluate(() => window.secretCount()), 0);
    await vault.getByLabel("Vault credential name").fill("denied-credential");
    await vault
      .getByLabel("Vault credential value")
      .fill("REJECTED_PRIVATE_VALUE");
    await page.evaluate(() => (window.vaultDenied = true));
    await vault
      .getByRole("button", { name: "Save to OS vault", exact: true })
      .click();
    await vault.getByRole("alert").waitFor();
    assert.ok(
      !(await vault.getByRole("alert").innerText()).includes(
        "SENSITIVE_KEYCHAIN_ERROR",
      ),
    );
    assert.equal(await page.evaluate(() => window.secretCount()), 0);
    assert.ok(
      !(
        await page.evaluate(() => JSON.stringify({ ...localStorage }))
      ).includes("REJECTED_PRIVATE_VALUE"),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await vault.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390);
    await page.screenshot({
      path: "/tmp/tidycode-desktop-vault-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
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
      .getByRole("button", { name: "Vault", exact: true })
      .waitFor();
    await workspace.locator(".api-request-bar button[type=submit]").click();
    await workspace
      .locator(".api-status strong")
      .filter({ hasText: "200" })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          window.vaultCalls.filter((c) => c.command === "api_http_request")
            .length,
      ),
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: desktop vault explicit save/load/use/delete, masked values, replacement/deletion consent, no auto-read, persistence secret omission, denied-keychain failure, mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
