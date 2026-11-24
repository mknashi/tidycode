const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.addInitScript(()=>{localStorage.setItem('tidycode-analytics-consent','denied');localStorage.setItem('privacy-banner-dismissed','true');});
await page.goto(process.env.APP_URL || 'http://127.0.0.1:5193/');
for (const [extension, content, label] of [
  ['toml','[service]\nhost = "localhost"\n[[servers]]\nname="alpha"','TOML'],
  ['yaml','service:\n  host: localhost\nservers:\n  - name: alpha','YAML'],
]) {
 await page.locator('#file-input').setInputFiles({name:`graph.${extension}`,mimeType:'text/plain',buffer:Buffer.from(content)});
 await page.getByTitle(`Show ${label} as a graph`,{exact:true}).waitFor({timeout:10000});
 const show=page.getByTitle(`Show ${label} as a graph`,{exact:true});
 if(await show.count()) await show.click();
 await page.getByTitle('Fit to view',{exact:true}).waitFor({timeout:10000});
 await page.waitForTimeout(700);
 const field=page.locator('svg text').filter({hasText:'localhost'}).first();
 await field.waitFor({timeout:10000});
 await field.evaluate(text=>text.parentElement.querySelector('rect').dispatchEvent(new MouseEvent('click',{bubbles:true})));
 await page.waitForTimeout(150);
 assert.match(await page.locator('.cm-activeLine').first().innerText(),/host/);
 await page.getByTitle('Export as SVG',{exact:true}).waitFor();
 await page.getByTitle('Hide Graph',{exact:true}).click();
 console.log(`${label} graph renders nested data and navigates to original source`);
}
}finally{await browser.close();}})();
