import { chromium } from 'playwright';
import * as fs from 'fs';

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.goto('https://www.sainsburys.co.uk/gol-ui/oauth/login', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  const html = await p.content();
  fs.writeFileSync('/app/sl.html', html);
  console.log('saved');
  const inputs = await p.$$eval('input', (els: Element[]) => els.map(e => e.outerHTML));
  console.log(inputs.join('\n'));
  await b.close();
})();
