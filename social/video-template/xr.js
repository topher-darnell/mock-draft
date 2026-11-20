const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await p.goto('file://' + __dirname + '/x.html'); await p.waitForTimeout(400); await p.screenshot({ path: 'bhg-x-daniel-jones-cut.png' }); await b.close(); })();
