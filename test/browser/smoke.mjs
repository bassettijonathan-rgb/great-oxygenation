// Opens the built page in Chromium at a desktop and a phone width, as it
// will be played: inside a sandboxed frame with scripts only. Checks that
// it starts, runs, never scrolls sideways, and logs no errors.
//
//   node test/browser/smoke.mjs [--shots <dir>]

import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shotsAt = process.argv.indexOf('--shots');
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (shots) await mkdir(shots, { recursive: true });

const fragment = await readFile(join(root, 'dist/index.html'), 'utf8');
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${fragment}</body></html>`;
const framed = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style></head>
<body><iframe sandbox="allow-scripts" src="/page"></iframe></body></html>`;

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(req.url === '/framed' ? framed : page);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`FAIL ${msg}`);
};
const ok = (msg) => console.log(`ok   ${msg}`);

const browser = await chromium.launch();
try {
  for (const vp of [
    { name: 'desktop', width: 1280, height: 860 },
    { name: 'phone', width: 390, height: 844, mobile: true },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.mobile ? 2 : 1,
      isMobile: !!vp.mobile,
      hasTouch: !!vp.mobile,
    });
    // no network in tests: the web fonts load as empty stylesheets
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    tab.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    await tab.goto(`${base}/framed`);
    const frame = tab.frameLocator('iframe');
    const app = tab.frames().find((f) => f !== tab.mainFrame()) ?? (await (await tab.waitForSelector('iframe')).contentFrame());
    await frame.locator('#play').waitFor();
    await app.waitForFunction(() => window.__goe && window.__goe.state.ready, null, { timeout: 15000 });
    const mode = await app.evaluate(() => window.__goe.host.mode);
    ok(`${vp.name}: page ready, simulation running in the ${mode}`);

    await frame.locator('#play').click();
    await app.waitForFunction(() => Number(document.getElementById('age').textContent) < 2.99, null, { timeout: 20000 }).then(
      () => ok(`${vp.name}: time moves when played`),
      () => fail(`${vp.name}: the age did not advance after Play`),
    );
    await frame.locator('#play').click(); // pause

    const overflow = await app.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) fail(`${vp.name}: page scrolls sideways by ${overflow}px`);
    else ok(`${vp.name}: no sideways scrolling`);
    if (shots) await tab.screenshot({ path: join(shots, `${vp.name}-start.png`), fullPage: false });

    // a number explains itself
    await frame.locator('.readout[data-explain="o2"]').click();
    await frame.locator('#sheet:not([hidden])').waitFor({ timeout: 3000 }).then(
      () => ok(`${vp.name}: tapping a number opens its explanation`),
      () => fail(`${vp.name}: the explanation sheet did not open`),
    );
    if (shots) await tab.screenshot({ path: join(shots, `${vp.name}-sheet.png`) });
    await frame.locator('#sheet-close').click();

    // Learn: predict first, then Show me
    await frame.locator('[data-tab="learn"]').click();
    await frame.locator('[data-option="0"]').click();
    await frame.locator('.predict-a:not([hidden])').waitFor({ timeout: 3000 }).then(
      () => ok(`${vp.name}: a prediction reveals the answer`),
      () => fail(`${vp.name}: the prediction did not reveal its answer`),
    );
    await frame.locator('[data-show]').click();
    await app.waitForFunction(() => Math.abs(Number(document.getElementById('age').textContent) - 2.95) < 0.002 && !window.__goe.state.running, null, { timeout: 30000 }).then(
      () => ok(`${vp.name}: Show me runs to its moment and stops`),
      () => fail(`${vp.name}: Show me did not stop at 2.95`),
    );
    if (shots) {
      await app.evaluate(() => window.scrollTo(0, 0));
      await tab.screenshot({ path: join(shots, `${vp.name}-learn.png`), fullPage: false });
    }

    for (const t of ['watch', 'lab', 'check']) {
      const btn = frame.locator(`[data-tab="${t}"]`);
      if (!(await btn.isVisible())) continue;
      await btn.click();
      await tab.waitForTimeout(250);
      const over = await app.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 0) fail(`${vp.name}: the ${t} tab scrolls sideways by ${over}px`);
      if (shots) {
        await app.evaluate(() => document.querySelector('#side').scrollIntoView());
        await tab.screenshot({ path: join(shots, `${vp.name}-${t}.png`) });
      }
    }
    const score = await frame.locator('.score').textContent();
    if (/9 of 11/.test(score)) ok(`${vp.name}: Validation shows ${score.trim()}`);
    else fail(`${vp.name}: unexpected validation score "${score}"`);

    // run fast to the snowball and look at it
    await app.evaluate(() => {
      document.querySelector('[data-tab="learn"]').click();
    });
    await app.evaluate(() => window.__goe.host.send({ type: 'runTo', age: 2.362, speed: 3 }));
    await app.waitForFunction(() => Number(document.getElementById('age').textContent) <= 2.3625 && !window.__goe.state.running, null, { timeout: 90000 }).then(
      () => ok(`${vp.name}: ran fast to 2.362 Ga`),
      () => fail(`${vp.name}: could not run to 2.362 Ga`),
    );
    const ice = await frame.locator('[data-value="ice"]').textContent();
    ok(`${vp.name}: ice at 2.362 Ga reads "${ice}"`);
    if (shots) {
      await app.evaluate(() => window.scrollTo(0, 0));
      await tab.waitForTimeout(400);
      await tab.screenshot({ path: join(shots, `${vp.name}-snowball.png`) });
      await frame.locator('[data-layer="life"]').click();
      await tab.waitForTimeout(400);
    }

    if (errors.length) for (const e of errors) fail(`${vp.name}: ${e}`);
    else ok(`${vp.name}: no errors in the console`);
    await ctx.close();
  }

  // A new version published while the page is open hands it the old
  // page's snapshot; the run picks up at the same age.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await ctx.addInitScript(() => {
      window.claude = { hot: { data: { seed: 'earth', scenario: 'real', params: {}, age: 2.6 } } };
    });
    const tab = await ctx.newPage();
    await tab.goto(`${base}/framed`);
    const app = await (await tab.waitForSelector('iframe')).contentFrame();
    await app.waitForFunction(() => Math.abs(Number(document.getElementById('age')?.textContent) - 2.6) < 0.002 && !window.__goe.state.running, null, { timeout: 60000 }).then(
      () => ok('an update picks up the run at the same age'),
      () => fail('an update did not pick up the run where it was'),
    );
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log('\nall browser checks passed');
