const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

function readCsvSync(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);
  if (!fs.existsSync(abs)) {
    console.error('CSV not found at', abs);
    return [];
  }
  let txt = fs.readFileSync(abs, 'utf8');
  // quick raw preview
  const rawHead = txt.split(/\r?\n/).slice(0,6).join('\n');
  console.log('CSV preview (first lines):\n', rawHead);

  // try parse with header columns:true
  let records = [];
  try {
    records = parse(txt, { columns: true, skip_empty_lines: true, trim: true });
    console.log('Parsed rows:', records.length);
    if (records.length > 0) {
      // log sample object keys and first 5 rows
      console.log('Sample keys:', Object.keys(records[0]).slice(0,20));
      console.log('First 5 parsed rows:', records.slice(0,5));
    }
  } catch (err) {
    console.error('csv-parse error:', err && err.message);
    // fallback: try parse without columns to inspect raw columns
    try {
      const raw = parse(txt, { relax_column_count: true, skip_empty_lines: true });
      console.log('Fallback raw parse rows:', raw.length);
      console.log('First 5 raw rows:', raw.slice(0,5));
    } catch (er2) {
      console.error('Fallback parse failed:', er2 && er2.message);
    }
  }
  return records;
}

module.exports = { readCsvSync };