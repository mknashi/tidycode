const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('tidycode-analytics-consent', 'denied');
      localStorage.setItem('privacy-banner-dismissed', 'true');
    });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5193/');
    const content = '# Configuration\nrouting_rules:\n  - name: "high-priority-events"\n    match_headers: { "X-Priority": "high" }\n    symbols: "@#;"';
    const create = async type => {
      await page.getByTitle('New File', { exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'New file', exact: true });
      await dialog.waitFor();
      await dialog.getByLabel('File type', { exact: true }).selectOption(type);
      await dialog.getByRole('button', { name: 'Create', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
    };
    const enter = async value => {
      await page.locator('.cm-content:visible').first().click();
      await page.keyboard.insertText(value);
      await page.waitForTimeout(400);
    };
    await create('yaml');
    await enter(content);
    assert.match(await page.locator('[data-tab-item]').filter({ hasText: '.yaml' }).last().innerText(), /\.yaml/);
    await page.getByTitle('Show YAML as a graph', { exact: true }).waitFor();
    await create('auto');
    await enter(content);
    await page.getByTitle('Show YAML as a graph', { exact: true }).waitFor();
    await create('text');
    await enter('# Title\n\n## Heading\n\n**bold**');
    assert.equal(await page.getByTitle('Show Markdown as a graph', { exact: true }).count(), 0);
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('notepad-tabs')));
    assert.equal(saved.at(-1).languageOverride, 'text');
    await page.reload();
    await page.locator('.cm-content:visible').first().waitFor();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('notepad-tabs')));
    assert.equal(saved.at(-1).languageOverride, 'text');
    await page.getByTitle('New File', { exact: true }).click();
    await page.getByRole('dialog', { name: 'New file', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'New file', exact: true }).waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log('Typed and auto YAML tabs, plain-text persistence, and cancel behavior passed');
  } finally { await browser.close(); }
})();
