import { RTL } from './languages.js';
import EN from './locales/en.json';

export { LANGUAGES, detect } from './languages.js';

// Other languages load on demand; the page stays in English until they arrive, or if they cannot.
const locales = import.meta.glob(['./locales/*.json', '!./locales/en.json'], { import: 'default' });
let strings = EN, wanted;
export let lang = 'en';

export const t = (key) => strings[key] ?? EN[key];

// Puts a language's text into the page, unless another was picked while it loaded: data-t sets an element's text, data-t-label its label (and tooltip, where it has one), and data-t-fill writes a sentence around the element's data-slot children.
export async function setLanguage(code) {
  wanted = code;
  const load = locales[`./locales/${code}.json`];
  const next = load ? await load().catch(() => EN) : EN;
  if (code !== wanted) return false;
  lang = code;
  strings = next;
  document.documentElement.lang = code;
  document.title = `Nooktown: ${t('title')}`;
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll('[data-t-label]')) {
    el.setAttribute('aria-label', t(el.dataset.tLabel));
    if (el.title) el.title = t(el.dataset.tLabel);
  }
  for (const el of document.querySelectorAll('[data-t-fill]')) {
    const slots = Object.fromEntries([...el.querySelectorAll('[data-slot]')].map((n) => [n.dataset.slot, n]));
    el.replaceChildren(...t(el.dataset.tFill).split(/\{(\w+)\}/).map((s, i) => (i % 2 ? slots[s] : s)));
    el.dir = RTL.includes(code) ? 'rtl' : 'ltr';
  }
  return true;
}
