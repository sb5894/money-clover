import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const draft = JSON.parse(readFileSync(new URL('../docs/ru-translation-draft.json', import.meta.url), 'utf8'));
const shipped = JSON.parse(readFileSync(new URL('../src/locales/ru.json', import.meta.url), 'utf8'));
test('shipping Russian text exactly matches the twice-reviewed catalog', () => {
  assert.deepEqual(shipped, draft);
  assert.equal(Object.keys(shipped).length, 211);
});
test('Russian translation preserves all interpolation fields and Korean won', () => {
  const fields = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [key, translation] of Object.entries(shipped)) {
    assert.deepEqual(fields(translation), fields(key), key);
    assert.ok(translation.trim(), key);
    assert.doesNotMatch(translation, /₽|рубл[ьяе]/i);
  }
  assert.equal(shipped['원'], '₩');
});
