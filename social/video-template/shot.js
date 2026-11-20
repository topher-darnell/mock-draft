const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 1080, height: 1920}});
  await p.goto('file://' + __dirname + '/jc.html'); await p.waitForTimeout(300);
  for (const t of [2.6, 4.4, 5.8, 8.0, 10.0, 11.6, 13.0, 16.5]) { await p.evaluate(t => setT(t), t); await p.screenshot({path: 's-' + t + '.jpg', type: 'jpeg', quality: 80}); }
  console.log(await p.evaluate(() => TOTAL)); await b.close(); })();
