// Builds dist/index.html: one self-contained page with the styles, the page
// script and the simulation worker (as a string the page turns into a Blob
// worker) all inline. The Validation tab's first results are computed here,
// by running the real-Earth default in Node, so the page can show them at
// once; the page can recompute them on demand.
//
//   node tools/build-artifact.mjs            build
//   node tools/build-artifact.mjs --quick    skip the validation run (keeps the last results)

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runValidation } from '../src/app/validation.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const at = (p) => join(root, p);

async function bundle(entry, define = {}) {
  const out = await build({
    entryPoints: [at(entry)],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    write: false,
    define,
  });
  return out.outputFiles[0].text.trim();
}

async function validation() {
  const cache = at('dist/validation.json');
  if (quick) {
    try {
      return JSON.parse(await readFile(cache, 'utf8'));
    } catch {
      console.warn('No saved validation results; running the check.');
    }
  }
  const t = Date.now();
  const result = await runValidation(null);
  console.log(`validation: ${result.passed}/${result.total} checks match (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  await writeFile(cache, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

await mkdir(at('dist'), { recursive: true });
const worker = await bundle('src/app/worker.js');
const result = await validation();
const main = await bundle('src/app/main.js', {
  __WORKER_SRC__: JSON.stringify(worker),
  __VALIDATION__: JSON.stringify(result),
});
// keep the inline script from closing its own tag
const js = main.replace(/<\/script/gi, '<\\/script');
if (js.includes('<!--')) throw new Error('The page script contains "<!--", which an inline script cannot hold safely.');
const css = (await readFile(at('src/app/style.css'), 'utf8')).trim();
const page = (await readFile(at('src/app/index.html'), 'utf8')).replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
await writeFile(at('dist/index.html'), page);
console.log(`dist/index.html: ${(page.length / 1024).toFixed(0)} KB`);
