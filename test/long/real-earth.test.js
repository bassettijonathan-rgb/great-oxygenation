// The full real-Earth run, scored against the rocks: the same checks as
// the Validation tab. Two are known misses of the model (see the README);
// everything else must match. The run must also reproduce, number for
// number, the results stored with the built page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runValidation } from '../../src/app/validation.js';

const KNOWN_MISSES = ['lomagundi', 'bifGap'];

test('the real-Earth run matches the rocks', async () => {
  const result = await runValidation(null);
  for (const c of result.checks) {
    console.log(`${c.pass ? 'match' : 'miss '} ${c.id.padEnd(10)} model: ${c.model} | rocks: ${c.real}`);
    if (!KNOWN_MISSES.includes(c.id)) assert.ok(c.pass, `${c.id}: ${c.what}: model ${c.model}, rocks ${c.real}`);
  }
  const saved = JSON.parse(await readFile(new URL('../../dist/validation.json', import.meta.url), 'utf8'));
  assert.deepEqual(result, saved, 'dist/validation.json is out of date: run npm run build');
});
