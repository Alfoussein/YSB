const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { parse } = require('csv-parse/sync');
const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const ffmpegPath = require('ffmpeg-static');
const countries = require('i18n-iso-countries');
try { countries.registerLocale(require('i18n-iso-countries/langs/en.json')); } catch(e) {}

// common name fixes for names that i18n-iso-countries doesn't resolve reliably
const COMMON_COUNTRY_ALIASES = {
  'uk': 'gb', 'united kingdom': 'gb', 'great britain': 'gb',
  'russia': 'ru', 'south korea': 'kr', 'north korea': 'kp',
  'united states': 'us', 'usa': 'us', 'u.s.': 'us',
  'czechia': 'cz', 'czech republic': 'cz', 'ivory coast': 'ci',
  'vatican': 'va', 'laos': 'la', 'viet nam': 'vn',
  'brunei darussalam': 'bn'
};

function countryNameToAlpha2(name) {
  if (!name) return '';
  const raw = String(name).trim().toLowerCase();
  if (!raw) return '';

  // Quick alias map
  if (COMMON_COUNTRY_ALIASES[raw]) return COMMON_COUNTRY_ALIASES[raw];

  // Try library helper functions
  try {
    if (typeof countries.getAlpha2 === 'function') {
      const res = countries.getAlpha2(raw, 'en');
      if (res) return String(res).toLowerCase();
    }
  } catch (e) {}

  // Scan through possible variations
  try {
    const all = countries.getNames && typeof countries.getNames === 'function' 
      ? countries.getNames('en') 
      : {};
    
    for (const code in all) {
      const nm = String(all[code]).toLowerCase();
      if (nm === raw || nm.includes(raw) || raw.includes(nm)) {
        return code.toLowerCase();
      }
    }
  } catch (e) {}

  return '';
}

function normalizeRowKeys(row) {
  const lc = {};
  for (const k of Object.keys(row || {})) {
    const kk = String(k || '').trim().toLowerCase();
    let v = row[k];
    if (v == null) v = '';
    else if (typeof v === 'string') v = v.trim();
    lc[kk] = v;
  }
  const pick = (...names) => {
    for (const n of names) {
      const key = String(n).trim().toLowerCase();
      if (key in lc && lc[key] !== '') return lc[key];
    }
    return '';
  };
  const normalized = {
    cityDep: pick('citydep', 'city_dep', 'from', 'departure'),
    countryDep: pick('countrydep', 'country_dep', 'countrydep', 'country'),
    cityDest: pick('citydest', 'city_dest', 'to', 'destination'),
    countryDest: pick('countrydest', 'country_dest', 'country'),
    IATA: pick('iata'),
    depIATA: pick('depiata', 'dep_iata'),
    priceFrom: pick('pricefrom', 'price_from', 'price'),
    date: pick('date'),
    depDay: pick('depday', 'dep_day'),
    depMonth: pick('depmonth', 'dep_month'),
    retDay: pick('retday', 'ret_day'),
    retMonth: pick('retmonth', 'ret_month'),
    tripUrl: pick('tripurl', 'trip_url', 'url')
  };
  if (normalized.priceFrom !== '') {
    normalized.priceFrom = Number(String(normalized.priceFrom).replace(/[^\d.-]/g, '')) || 0;
  }
  return normalized;
}

function extractMonthKey(row) {
  // try to find ddate=YYYY-MM-DD in tripUrl (possibly urlencoded)
  const u = (row.tripUrl || '') + '';
  const m1 = u.match(/ddate%3D(\d{4})-(\d{2})-\d{2}/);
  if (m1) return `${m1[1]}-${m1[2]}`;
  const m2 = u.match(/ddate=(\d{4})-(\d{2})-\d{2}/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  
  // fallback: use depMonth with current year
  const depMonth = Number(row.depMonth || (row.date || '').replace(/.*-.*(\d{2})$/,''));
  const year = new Date().getFullYear();
  if (depMonth && depMonth > 0 && depMonth <= 12) {
    return `${year}-${String(depMonth).padStart(2,'0')}`;
  }
  
  // last fallback: current month
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`;
}

function buildDeparturesMap(records) {
  const map = new Map();
  for (const r of records) {
    const dep = (r.cityDep || '').toString().trim();
    if (!dep) continue;
    
    const monthKey = extractMonthKey(r);
    const destCountryCode = countryNameToAlpha2(r.countryDest) || 
                            countryNameToAlpha2(r.countryDep) || '';
    
    const rowForClient = {
      cityDep: r.cityDep,
      countryDep: r.countryDep,
      cityDest: r.cityDest,
      countryDest: r.countryDest,
      destCountryCode,
      priceFrom: r.priceFrom ? Number(r.priceFrom) : null,
      date: r.date,
      tripUrl: r.tripUrl
    };
    
    if (!map.has(dep)) map.set(dep, {});
    const months = map.get(dep);
    
    if (!months[monthKey]) months[monthKey] = [];
    months[monthKey].push(rowForClient);
  }
  
  // sort each month's rows by ascending price
  for (const [dep, months] of map.entries()) {
    for (const m in months) {
      months[m].sort((a, b) => {
        const pa = (a.priceFrom == null) ? Number.POSITIVE_INFINITY : Number(a.priceFrom);
        const pb = (b.priceFrom == null) ? Number.POSITIVE_INFINITY : Number(b.priceFrom);
        return pa - pb;
      });
    }
  }
  
  return map;
}

async function findCsvInFolder(baseDir, specificFolder = null) {
  try {
    // If a specific folder is provided, check that first
    if (specificFolder) {
      const specificPath = path.join(baseDir, specificFolder);
      try {
        // Check if the specific folder exists
        await fsPromises.access(specificPath);
        
        // Read files in the specific folder
        const files = await fsPromises.readdir(specificPath);
        const csvFiles = files.filter(file => 
          path.extname(file).toLowerCase() === '.csv' && 
          !file.startsWith('~$')
        );

        if (csvFiles.length > 0) {
          console.log(`Found CSV in specified folder ${specificFolder}:`, csvFiles[0]);
          return path.join(specificPath, csvFiles[0]);
        }
      } catch (specificError) {
        console.warn(`Specified folder ${specificFolder} not found or empty`);
      }
    }

    // If no specific folder or it's empty, find most recent
    const items = await fsPromises.readdir(baseDir, { withFileTypes: true });
    
    // Filter and sort date folders (assuming they are in YYYYMMDD format)
    const dateFolders = items
      .filter(item => item.isDirectory() && /^\d{8}$/.test(item.name))
      .map(item => item.name)
      .sort()
      .reverse(); // Most recent first

    console.log('Date folders found:', dateFolders);

    // Iterate through date folders to find first CSV
    for (const dateFolder of dateFolders) {
      const folderPath = path.join(baseDir, dateFolder);
      const files = await fsPromises.readdir(folderPath);
      
      // Find CSV files
      const csvFiles = files.filter(file => 
        path.extname(file).toLowerCase() === '.csv' && 
        !file.startsWith('~$')
      );

      console.log(`CSV files in ${dateFolder}:`, csvFiles);

      // Return the first CSV file found
      if (csvFiles.length > 0) {
        return path.join(folderPath, csvFiles[0]);
      }
    }

    console.warn('No CSV files found in any date subfolders');
    return null;
  } catch (error) {
    console.error('Error finding CSV:', error);
    return null;
  }
}

async function readCsv() {
  let csvPath = null;
  try {
    // Base directory for final result sheets
    const baseDir = path.join(__dirname, '..', 'assets', 'others', 'final_result_sheets');
    
    // Find the CSV file
    csvPath = await findCsvInFolder(baseDir);
    
    if (!csvPath) {
      console.error('No CSV file found');
      return [];
    }
    
    console.log('Reading CSV from:', csvPath);
    
    // Read file contents
    const txt = await fsPromises.readFile(csvPath, { encoding: 'utf8' });
    
    // Validate file content
    if (!txt || txt.trim() === '') {
      console.error('CSV file is empty:', csvPath);
      return [];
    }
    
    // Parse CSV
    let parsed;
    try {
      parsed = parse(txt, { 
        columns: true, 
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true // Add some flexibility
      });
    } catch (parseError) {
      console.error('CSV parsing error:', parseError);
      
      // Fallback parsing attempt
      try {
        parsed = parse(txt, { 
          columns: false, 
          skip_empty_lines: true,
          trim: true
        });
        
        // If fallback parsing works, try to convert to object
        if (parsed.length > 0) {
          const headers = parsed[0];
          parsed = parsed.slice(1).map(row => 
            Object.fromEntries(headers.map((header, index) => [header, row[index]]))
          );
        }
      } catch (fallbackError) {
        console.error('Fallback CSV parsing failed:', fallbackError);
        return [];
      }
    }
    
    // Filter out completely empty rows
    parsed = parsed.filter(row => 
      row && Object.values(row).some(val => val !== null && val !== '')
    );
    
    // Normalize row keys
    const normalized = parsed.map(normalizeRowKeys);
    
    console.log('CSV read successful');
    console.log('Total rows:', normalized.length);
    
    // Optional: Log first few rows for debugging
    if (normalized.length > 0) {
      console.log('First few rows:');
      console.log(normalized.slice(0, 5).map(row => {
        // Mask sensitive data if needed
        const maskedRow = {...row};
        if (maskedRow.tripUrl) {
          maskedRow.tripUrl = maskedRow.tripUrl.substring(0, 50) + '...';
        }
        return maskedRow;
      }));
    }
    
    return normalized;
  } catch (e) {
    console.error('Detailed CSV read error:', {
      message: e.message,
      stack: e.stack,
      csvPath: csvPath
    });
    
    // Additional diagnostic logging
    if (csvPath) {
      try {
        const stats = await fsPromises.stat(csvPath);
        console.log('File stats:', {
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      } catch (statError) {
        console.error('Could not get file stats:', statError);
      }
    }
    
    return [];
  }
}



// Configuration constants
const PORT = process.env.PORT || 3000;
const outDir = path.join(__dirname, '..', 'recordings');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const animationDurationMs = 30000;    // 30 secondes d'animation totale
const postScrollDelayMs = 2000;        // très court, juste pour stabiliser
const recordDurationMs = 65000;       // 30 secondes d'enregistrement

const FRAME_WIDTH = 1080;
const FRAME_HEIGHT = 1920;

// VIEWPORT CORRIGÉ – 1080×1920 = crash, on remet les bonnes valeurs
const BROWSER_WIDTH = process.env.BROWSER_WIDTH ? parseInt(process.env.BROWSER_WIDTH) : 1080;
const BROWSER_HEIGHT = process.env.BROWSER_HEIGHT ? parseInt(process.env.BROWSER_HEIGHT) : 1920;
const DEVICE_SCALE = process.env.DEVICE_SCALE ? Number(process.env.DEVICE_SCALE) : 1;

(async () => {
  console.log('Démarrage du recorder vidéo TikTok/Reels');

  const raw = await readCsv();
  const departuresMap = buildDeparturesMap(raw.length > 0 ? raw : []);

  const app = express();
  app.use(express.static(path.join(__dirname, '..')));

  app.get('/data', (req, res) => {
    const city = (req.query.city || '').trim();
    if (!city) return res.json({ departure: '', months: {} });
    const key = Array.from(departuresMap.keys()).find(k => k.toLowerCase() === city.toLowerCase()) ||
                Array.from(departuresMap.keys()).find(k => k.toLowerCase().includes(city.toLowerCase()));
    if (!key) return res.json({ departure: '', months: {} });
    res.json({ departure: key, months: departuresMap.get(key) || {} });
  });

  const server = app.listen(PORT, () => console.log(`Server http://localhost:${PORT}`));

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--window-size=${BROWSER_WIDTH},${BROWSER_HEIGHT}`,
      `--force-device-scale-factor=${DEVICE_SCALE}`
    ],
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false
  });

  const page = await browser.newPage();
  await page.setViewport({ width: BROWSER_WIDTH, height: BROWSER_HEIGHT, deviceScaleFactor: DEVICE_SCALE });

  const departures = Array.from(departuresMap.keys());
  const limit = process.env.DEBUG_LIMIT ? parseInt(process.env.DEBUG_LIMIT) : departures.length;

  for (let i = 0; i < departures.length && i < limit; i++) {
    const depCity = departures[i];
    console.log(`Recording ${i + 1}/${limit} → ${depCity}`);

    try {
      const url = `http://localhost:${PORT}/index_for_video.html?city=${encodeURIComponent(depCity)}&frameW=${FRAME_WIDTH}&frameH=${FRAME_HEIGHT}`;
      
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Attente que le carousel soit prêt
      await Promise.race([
        page.waitForFunction(() => window.__carouselReady === true, { timeout: 15000 }),
        page.waitForSelector('.card-slot', { timeout: 15000 })
      ]);
      

      // Préparation pour la détection de scroll de la dernière carte
      await page.evaluate(() => {
        window.__lastCardScrollDetected = false;
        
        // Ajouter un observateur sur le dernier carousel-wrapper
        const carouselWrappers = document.querySelectorAll('.carousel-wrapper');
        const lastWrapper = carouselWrappers[carouselWrappers.length - 1];
        
        if (lastWrapper) {
          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                window.__lastCardScrollDetected = true;
                console.log('Dernière carte dépassée');
              }
            });
          }, { threshold: 0.1 });
          
          observer.observe(lastWrapper);
        }
      });

      // Force animation reset
      await page.evaluate(() => {
        document.querySelectorAll('.carousel-wrapper').forEach(wrapper => {
          wrapper.classList.add('animating');
          wrapper.style.animation = '';
          wrapper.style.animationPlayState = 'running';
        });
      });

      // Préparation de l'enregistrement
      const recorder = new PuppeteerScreenRecorder(page, {
        fps: 30,
        videoFrame: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
        ffmpeg_path: ffmpegPath,
        recordOptions: {
          'preset': 'ultrafast',
          'crf': '23',
          'tune': 'animation',
          'pix_fmt': 'yuv420p'
        }
      });

      const safeName = depCity.replace(/[\\/:*?"<>|]/g, '_');
      const outPath = path.join(outDir, `${safeName}_${FRAME_WIDTH}x${FRAME_HEIGHT}.mp4`);

      const start = Date.now();
      await recorder.start(outPath);

      // Attente dynamique avec détection de la dernière carte
      await page.waitForFunction(() => {
        // Si la dernière carte a été scrollée, déclenche le délai de 5 secondes
        if (window.__lastCardScrollDetected) {
          if (!window.__lastCardScrollTimer) {
            window.__lastCardScrollTimer = Date.now();
          }
          return Date.now() - window.__lastCardScrollTimer > 30000;
        }
        return false;
      }, { timeout: recordDurationMs });

      await recorder.stop();
      console.log(`Recording duration: ${Date.now() - start}ms`);
      
    } catch (err) {
      console.error(`Échec pour ${depCity} :`, err.message);
    }
  }

  await browser.close();
  server.close();
  console.log('Terminé – toutes les vidéos sont dans /recordings');
})();