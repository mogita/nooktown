import assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { LANGUAGES, detect } from '../src/i18n/languages.js';

// Every listed language has a translation of every English text, keeping its {slots}.
const dir = new URL('../src/i18n/locales/', import.meta.url), read = (code) => JSON.parse(readFileSync(new URL(`${code}.json`, dir)));
const en = read('en'), slots = (s) => s.match(/\{\w+\}/g)?.sort() ?? [];
assert.deepEqual(readdirSync(dir).map((f) => f.replace('.json', '')).sort(), LANGUAGES.map(([code]) => code).sort(), 'locale files and the language list differ');
for (const [code] of LANGUAGES) {
  const strings = read(code);
  assert.deepEqual(Object.keys(strings), Object.keys(en), `${code} keys differ from English`);
  for (const k in en) {
    assert.ok(strings[k].trim(), `${code} ${k} is empty`);
    assert.deepEqual(slots(strings[k]), slots(en[k]), `${code} ${k} slots differ`);
  }
}

// The browser's preferences pick the closest listed language.
const cases = { 'de-AT': 'de', pt: 'pt-BR', 'pt-PT': 'pt-PT', zh: 'zh-CN', 'zh-SG': 'zh-CN', 'zh-HK': 'zh-TW', 'zh-Hant-TW': 'zh-TW', 'nn-NO': 'nb', tl: 'fil', 'es-419': 'es', 'en-US': 'en' };
for (const [pref, code] of Object.entries(cases)) assert.equal(detect([pref]), code, pref);
assert.equal(detect(['xx', 'fr-CA']), 'fr', 'an unlisted first choice falls through to the next');
assert.equal(detect([]), 'en');
console.log(`PASS: ${LANGUAGES.length} languages translate every text, and browser preferences pick the closest one`);
