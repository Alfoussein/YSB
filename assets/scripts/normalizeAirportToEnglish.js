const fs = require('fs');
const path = require('path');
const countries = require('i18n-iso-countries');

// register locales
const LANGS = ['en','fr','de','es','it','nl','pt','ro','ru','sv','no','da','pl','hu','cs'];
for (const l of LANGS) {
  try { countries.registerLocale(require(`i18n-iso-countries/langs/${l}.json`)); } catch (e) { /* ignore */ }
}

const IN_FILE = path.join(__dirname, '..', 'others','airport_Europe.csv');
const OUT_FILE = path.join(__dirname, '..', 'airport_Europe_normalized_en.csv');
if (!fs.existsSync(IN_FILE)) { console.error('Input CSV not found:', IN_FILE); process.exit(1); }

const raw = fs.readFileSync(IN_FILE, 'utf8');
const lines = raw.split(/\r?\n/);
if (!lines.length) { console.error('Empty CSV'); process.exit(1); }
const header = lines.shift();

function removeDiacritics(s){ return s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function normalizeForLookup(s){ if (s === undefined || s === null) return ''; return removeDiacritics(String(s).trim()).toLowerCase().replace(/\s+/g,' ').replace(/[-–—]/g,' ').trim(); }

// Manual mappings for variants / local spellings -> desired English names
const MANUAL_COUNTRY_MAP = {
  'Türkiye': 'Turkey',
  'turkiye': 'Turkey',
  'türkiye': 'Turkey',
  'turkey': 'Turkey',
  'russian federation': 'Russia',
  'russia': 'Russia',
  'unitedkingdom': 'United Kingdom',
  'united kingdom': 'United Kingdom',
  'moldova republic of': 'Moldova',
  'moldova, republic of': 'Moldova',
  'macedonia': 'North Macedonia', // adjust if you prefer "Macedonia"
  'north macedonia': 'North Macedonia',
  // add more mappings if you find other problematic entries
};

// normalize helpers
function normalizeCity(s) {
  if (s === undefined || s === null) return '';
  let t = String(s).trim();
  t = t.replace(/^"|"$/g, '');
  t = t.replace(/[-–—]/g, ' ');           // replace hyphens with space
  t = removeDiacritics(t);
  t = t.replace(/[^0-9A-Za-z'\s]+/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  // return lowercase with spaces as you requested (e.g. "cluj napoca")
  return t.toLowerCase();
}

function toEnglishCountry(orig) {
  if (orig === undefined || orig === null) return '';
  const norm = normalizeForLookup(orig);
  if (!norm) return '';

  // manual map check first (covers Türkiye, Russian Federation, etc.)
  if (MANUAL_COUNTRY_MAP[norm]) return MANUAL_COUNTRY_MAP[norm];

  // try i18n-iso-countries lookup (English and many locales)
  let code = countries.getAlpha2Code(norm, 'en');
  if (!code) {
    for (const l of LANGS) {
      if (l === 'en') continue;
      code = countries.getAlpha2Code(norm, l);
      if (code) break;
    }
  }
  if (code) {
    const en = countries.getName(code, 'en');
    if (en) return en;
  }

  // fallback: Title Case normalized string
  return norm.split(' ').map(w => w ? (w[0].toUpperCase() + w.slice(1)) : '').join(' ');
}

// Process file
const out = [header];
const samples = [];
for (const line of lines) {
  if (!line || !line.trim()) continue;
  const cols = line.split(';');
  if (cols.length < 3) { out.push(line); continue; }

  const origCity = cols[1] || '';
  const origCountry = cols[2] || '';

  cols[1] = normalizeCity(origCity);        // "cluj napoca"
  cols[2] = toEnglishCountry(origCountry);  // "Turkey", "Russia", etc.

  out.push(cols.join(';'));
  if (samples.length < 20 && (origCity !== cols[1] || origCountry !== cols[2])) {
    samples.push({ before: { city: origCity, country: origCountry }, after: { city: cols[1], country: cols[2] }});
  }
}

fs.writeFileSync(OUT_FILE, out.join('\n'), 'utf8');
console.log('Wrote:', OUT_FILE);
if (samples.length) {
  console.log('Sample conversions:');
  samples.forEach((s,i) => console.log(`${i+1}. "${s.before.city}" -> "${s.after.city}" | "${s.before.country}" -> "${s.after.country}"`));
}