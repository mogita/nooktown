// Each language by its own name, ordered as most language pickers do: alphabetically with Latin scripts first, then the other scripts in Unicode order.
export const LANGUAGES = [
  ['id', '🇮🇩', 'Bahasa Indonesia'],
  ['ms', '🇲🇾', 'Bahasa Melayu'],
  ['cs', '🇨🇿', 'Čeština'],
  ['da', '🇩🇰', 'Dansk'],
  ['de', '🇩🇪', 'Deutsch'],
  ['en', '🇬🇧', 'English'],
  ['es', '🇪🇸', 'Español'],
  ['fil', '🇵🇭', 'Filipino'],
  ['fr', '🇫🇷', 'Français'],
  ['hr', '🇭🇷', 'Hrvatski'],
  ['it', '🇮🇹', 'Italiano'],
  ['hu', '🇭🇺', 'Magyar'],
  ['nl', '🇳🇱', 'Nederlands'],
  ['nb', '🇳🇴', 'Norsk'],
  ['pl', '🇵🇱', 'Polski'],
  ['pt-BR', '🇧🇷', 'Português (Brasil)'],
  ['pt-PT', '🇵🇹', 'Português (Portugal)'],
  ['ro', '🇷🇴', 'Română'],
  ['sk', '🇸🇰', 'Slovenčina'],
  ['fi', '🇫🇮', 'Suomi'],
  ['sv', '🇸🇪', 'Svenska'],
  ['vi', '🇻🇳', 'Tiếng Việt'],
  ['tr', '🇹🇷', 'Türkçe'],
  ['el', '🇬🇷', 'Ελληνικά'],
  ['bg', '🇧🇬', 'Български'],
  ['ru', '🇷🇺', 'Русский'],
  ['uk', '🇺🇦', 'Українська'],
  ['he', '🇮🇱', 'עברית'],
  ['ur', '🇵🇰', 'اردو'],
  ['ar', '🇸🇦', 'العربية'],
  ['fa', '🇮🇷', 'فارسی'],
  ['hi', '🇮🇳', 'हिन्दी'],
  ['bn', '🇧🇩', 'বাংলা'],
  ['th', '🇹🇭', 'ไทย'],
  ['zh-CN', '🇨🇳', '中文（简体）'],
  ['zh-TW', '🇭🇰', '中文（繁體）'],
  ['ja', '🇯🇵', '日本語'],
  ['ko', '🇰🇷', '한국어'],
];

export const RTL = ['ar', 'fa', 'he', 'ur'];

// Older and alternative codes some browsers still report.
const ALIASES = { in: 'id', iw: 'he', nn: 'nb', no: 'nb', tl: 'fil' };

// The first of the browser's preferred languages on the list: the exact language and region, Chinese by its script, then the language alone. English otherwise.
export function detect(prefs) {
  const codes = LANGUAGES.map(([code]) => code);
  for (const pref of prefs) {
    const p = pref.toLowerCase(), base = ALIASES[p.split('-')[0]] ?? p.split('-')[0];
    const match = codes.find((c) => c.toLowerCase() === p) ?? (base === 'zh' ? (/-(hant|tw|hk|mo)\b/.test(p) ? 'zh-TW' : 'zh-CN') : codes.find((c) => c.split('-')[0] === base));
    if (match) return match;
  }
  return 'en';
}
