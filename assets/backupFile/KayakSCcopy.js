// ...existing code...
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const randomUseragent = require('random-useragent');
require('dotenv').config();

puppeteerExtra.use(StealthPlugin());

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// normalize key helper (lowercase, remove diacritics, replace hyphens with space)
function normalizeKey(s) {
    if (s === undefined || s === null) return '';
    let t = String(s).trim().toLowerCase();
    t = t.replace(/[-–—]/g, ' ');
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/[^0-9a-z\s]+/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
}

// --- load airport CSV helper ---
function loadAirportData(csvPath) {
    const cityMap = new Map(); // key: normalized city/airportName -> { country, iata, airportName }
    if (!fs.existsSync(csvPath)) return cityMap;
    const raw = fs.readFileSync(csvPath, 'utf8');
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return cityMap;
    lines.shift(); // remove header
    for (const line of lines) {
        const cols = line.split(';').map(c => c.trim());
        const airportName = (cols[0] || '').replace(/(^"|"$)/g, '');
        const city = cols[1] || '';
        const country = cols[2] || '';
        const iata = (cols[3] || '').toUpperCase();
        const keyCity = normalizeKey(city);
        const keyAirport = normalizeKey(airportName);
        if (keyCity) cityMap.set(keyCity, { country, iata, airportName });
        if (keyAirport) cityMap.set(keyAirport, { country, iata, airportName });
    }
    return cityMap;
}

// build date string YYYY-MM-DD from day and month (month as number or '01'..'12')
// if month earlier than current month, assume next year
function buildDateFromParts(day, monthStr) {
    if (!day || !monthStr) return '';
    const m = parseInt(String(monthStr).replace(/^0+/, '') || monthStr, 10);
    const d = parseInt(day, 10);
    if (!m || !d) return '';
    const now = new Date();
    let year = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    if (m < currentMonth) year += 1;
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
}

// parse human date range like "6 nov - 8 nov" or "Nov 21 - Nov 22" to YYYY-MM-DD
function parseDateRangeText(text) {
    if (!text || typeof text !== 'string') return { depart: '', ret: '' };
    let t = text.replace(/\./g, '').trim().toLowerCase();

    // Accept several separators and multiple spacing variants
    const parts = t.split(/\s*[-–—]\s*/).map(p => p.trim()).filter(Boolean);

    const months = {
        jan: 1, janv: 1, janvier: 1, january: 1,
        feb: 2, fev: 2, fevrier: 2, février: 2, february: 2,
        mar: 3, mars: 3, march: 3,
        apr: 4, avr: 4, avril: 4, april: 4,
        may: 5, mai: 5,
        jun: 6, juin: 6, june: 6,
        jul: 7, juil: 7, juillet: 7, july: 7,
        aug: 8, aout: 8, août: 8, august: 8,
        sep: 9, sept: 9, septembre: 9, september: 9,
        oct: 10, octo: 10, octobre: 10, october: 10,
        nov: 11, novembre: 11, november: 11,
        dec: 12, decem: 12, déc: 12, décembre: 12, december: 12
    };

    function parsePart(part) {
        if (!part) return '';
        // Pattern 1: "21 nov" or "6 nov"
        let m = part.match(/^\s*(\d{1,2})\s*([a-z\u00C0-\u017F]+)\s*(\d{4})?\s*$/i);
        if (m) {
            const day = parseInt(m[1], 10);
            const monRaw = m[2].toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
            const mon = months[monRaw] || months[monRaw.slice(0,3)];
            if (!mon || !day) return '';
            return buildDateFromParts(day, String(mon));
        }
        // Pattern 2: "nov 21" or "november 21"
        m = part.match(/^\s*([a-z\u00C0-\u017F]+)\s*(\d{1,2})\s*(\d{4})?\s*$/i);
        if (m) {
            const monRaw = m[1].toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
            const day = parseInt(m[2], 10);
            const mon = months[monRaw] || months[monRaw.slice(0,3)];
            if (!mon || !day) return '';
            return buildDateFromParts(day, String(mon));
        }
        return '';
    }

    const depart = parsePart(parts[0]) || '';
    const ret = parts[1] ? parsePart(parts[1]) || '' : '';
    return { depart, ret };
}

(async () => {
    try {
        const inputExcelFilePath = path.join(__dirname, 'assets', 'others', 'anywhere_flights.xlsx');
        if (!fs.existsSync(inputExcelFilePath)) {
            console.error(`Input file not found: ${inputExcelFilePath}`);
            return;
        }

        const inputWorkbook = XLSX.readFile(inputExcelFilePath);
        const inputSheet = inputWorkbook.Sheets[inputWorkbook.SheetNames[0]];
        const sheetData = XLSX.utils.sheet_to_json(inputSheet, { header: 1 });

        const extractedData = sheetData.map(row => {
            if (Array.isArray(row) && row.length >= 2) return { country: row[0], city: row[1] };
            return null;
        }).filter(Boolean);

        const citiesDepList = extractedData.map(e => (typeof e.city === 'string' ? e.city.trim() : '')).filter(Boolean);
        const countriesDepList = extractedData.map(e => (typeof e.country === 'string' ? e.country.trim() : ''));

        if (!citiesDepList.length) {
            console.error('No cities found in anywhere_flights.xlsx — nothing to process.');
            return;
        }

        // load airport CSV once
        const airportCsvPath = path.join(__dirname, 'airport_Europe.csv');
        const cityMap = loadAirportData(airportCsvPath);

        const browser = await puppeteerExtra.launch({ headless: false });
        const page2 = await browser.newPage();
        await page2.setUserAgent(randomUseragent.getRandom());
        await page2.setViewport({ width: 1720, height: 1000 });

        // go to a default explore page (can be adjusted)
        await page2.goto("https://www.kayak.com/explore/", { waitUntil: 'networkidle2' });

        const maxCitiesToProcess = Math.min(3, citiesDepList.length);

        for (let z = 0; z < maxCitiesToProcess; z++) {
            const cityDep = citiesDepList[z];
            const countryDep = countriesDepList[z] || 'N/A';
            console.log(`\n--- Processing city ${z + 1}: ${cityDep} from ${countryDep} ---`);

            const outputExcelFilePath = path.join(__dirname, 'assets', 'others', 'ready_sheets', `${cityDep}.xlsx`);
            const sheetName = 'anywhere output Flight Data';

            // prepare workbook & sheet (do not write yet)
            let outputWorkbook;
            let outputSheet;
            if (fs.existsSync(outputExcelFilePath)) {
                outputWorkbook = XLSX.readFile(outputExcelFilePath);
                outputSheet = outputWorkbook.Sheets[sheetName];
            } else {
                outputWorkbook = XLSX.utils.book_new();
                outputSheet = XLSX.utils.aoa_to_sheet([["cityDep","CountryDep","cityDest","countryDest","IATA","depIATA","priceFrom","date","depDay","depMonth","retDay","retMonth","tripUrl"]]);
                XLSX.utils.book_append_sheet(outputWorkbook, outputSheet, sheetName);
            }

            // build dedupe set from existing file rows
            const existingRows = XLSX.utils.sheet_to_json(outputSheet || {}, { header: 1 });
            const existingKeys = new Set();
            for (let i = 1; i < existingRows.length; i++) {
                const r = existingRows[i] || [];
                const key = `${r[0] || ''}||${r[2] || ''}||${r[7] || ''}`; // cityDep||cityDest||date (date idx 7)
                existingKeys.add(key);
            }

            const newRowsForCity = [];

            // lookup departure IATA once for this origin city
            let depIata = '';
            try {
                const depKey = normalizeKey(cityDep);
                let depMeta = cityMap.get(depKey);
                if (!depMeta) {
                    for (const [k, v] of cityMap.entries()) {
                        if (!k) continue;
                        if (depKey.includes(k) || k.includes(depKey)) { depMeta = v; break; }
                    }
                }
                depIata = (depMeta && depMeta.iata) ? depMeta.iata.toLowerCase() : '';
            } catch (e) {
                depIata = '';
            }

            // handle cookies once per city
            await delay(1500);
            const cookiesButton = await page2.$('.P4zO-submit-buttons button:nth-child(3)');
            if (cookiesButton) { await cookiesButton.click().catch(()=>{}); await delay(800); }

            // open origin input and type city
            try {
                await page2.click('.xGVG-location-inputs .xGVG-input:first-child').catch(()=>{});
                await delay(800);
                const el = await page2.$('.xGVG-location-inputs input.NhpT');
                const inputSelector = el ? '.xGVG-location-inputs input.NhpT' : '.c4Gq3-input input.NhpT';
                await page2.focus(inputSelector);
                await page2.click(inputSelector);
                await page2.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.value = ''; }, inputSelector);
                await delay(300);
                await page2.type(inputSelector, cityDep, { delay: 80 });
                await delay(1200);
                await page2.keyboard.press('Enter');
                await delay(1200);
            } catch (e) {
                console.warn('Origin input interaction failed, continuing:', e.message);
            }

            // month loops: collect scraped items into newRowsForCity (but do not write yet)
            for (let f = 0; f < 3; f++) {
                await delay(800);
                // date selector open
                try {
                    await page2.click('[aria-label="Select dates"]');
                    await page2.waitForSelector('.sGVi-dropdown-content', { visible: true, timeout: 5000 });
                    await delay(1500);
                } catch (e) {
                    // ignore
                }
                try {
                    const monthSpans = await page2.$$('.e9D2 span.IAhs');
                    if (monthSpans.length > f + 1) {
                        await monthSpans[f + 1].click();
                        await delay(1200);
                    }
                } catch (e) {}
                // click Done (various fallbacks)
                try {
                    const doneSelector = '.CjDg .RxNS-button-content';
                    await page2.click(doneSelector);
                    await delay(1000);
                } catch (e) {
                    try {
                        const doneButtons = await page2.$$('div[class*="button-content"]');
                        for (const btn of doneButtons) {
                            const text = await page2.evaluate(el => el.textContent.trim().toLowerCase(), btn);
                            if (['done', 'terminé', 'appliquer', 'valider'].includes(text)) {
                                await btn.click();
                                await delay(1000);
                                break;
                            }
                        }
                    } catch (e2) {}
                }

                await delay(800);
                const seeMoreButton = await page2.$('.kHp7-paginator button');
                if (seeMoreButton) { await seeMoreButton.click().catch(()=>{}); await delay(800); }

                const dataTicketPart = await page2.evaluate(() => {
                    function parseDateRange(input) {
                        const months = {
                            janv: "01", févr: "02", mars: "03", avr: "04", mai: "05", juin: "06",
                            juil: "07", août: "08", sept: "09", oct: "10", nov: "11", déc: "12",
                            jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
                        };
                        if (!input) return [{ depDay: null, depMonth: null, retDay: null, retMonth: null }];
                        const cleanedInput = input.replaceAll('.', '').trim();
                        const parts = cleanedInput.split(' - ');
                        if (parts.length !== 2) return [{ depDay: null, depMonth: null, retDay: null, retMonth: null }];
                        const [depPart, retPart] = parts;
                        // try "21 nov" or "nov 21"
                        const dp = depPart.split(' ').filter(Boolean);
                        const rp = retPart.split(' ').filter(Boolean);
                        const depDay = parseInt(dp.find(p => /\d+/.test(p)) || null, 10) || null;
                        const depMonth = dp.find(p => /[A-Za-z\u00C0-\u017F]+/.test(p)) || null;
                        const retDay = parseInt(rp.find(p => /\d+/.test(p)) || null, 10) || null;
                        const retMonth = rp.find(p => /[A-Za-z\u00C0-\u017F]+/.test(p)) || null;
                        return [{
                            depDay: depDay || null,
                            depMonth: months[depMonth] || months[(depMonth || '').toLowerCase()] || null,
                            retDay: retDay || null,
                            retMonth: months[retMonth] || months[(retMonth || '').toLowerCase()] || null
                        }];
                    }

                    const arr = [];
                    const container = document.querySelector('.iTRg-list ul');
                    if (!container) return arr;
                    const cardList = container.querySelectorAll('.kHp7-card');
                    cardList.forEach(card => {
                        const cardDetail = card.querySelector('.fG2m');
                        if (!cardDetail) return;
                        const cityElem = cardDetail.querySelector('.v8LF');
                        if (!cityElem) return;
                        if (cityElem.textContent.toLowerCase().includes("anything")) return;
                        const priceFrom = card.querySelector('.jETt-price')?.innerText || "N/A";
                        const dateElem = cardDetail.querySelectorAll('.jETt-info')[0];
                        const dateText = dateElem?.innerText || "";
                        const parsed = parseDateRange(dateText)[0] || {};
                        arr.push({
                            cityDest: cityElem.innerText.trim(),
                            countryDest: "N/A",
                            priceFrom: priceFrom,
                            date: dateText,
                            depDay: parsed.depDay,
                            depMonth: parsed.depMonth,
                            retDay: parsed.retDay,
                            retMonth: parsed.retMonth
                        });
                    });
                    return arr;
                }).catch(err => {
                    console.warn('evaluate failed:', err.message);
                    return [];
                });

                for (const element of dataTicketPart) {
                    element.cityDep = cityDep;
                    element.countryDep = countryDep;

                    // lookup CSV for destination (normalized)
                    const destKey = normalizeKey(element.cityDest || '');
                    let meta = cityMap.get(destKey);
                    if (!meta) {
                        for (const [k, v] of cityMap.entries()) {
                            if (!k) continue;
                            if (destKey.includes(k) || k.includes(destKey)) { meta = v; break; }
                        }
                    }
                    if (meta) {
                        if (!element.countryDest || element.countryDest === 'N/A') element.countryDest = meta.country || element.countryDest;
                        element.iata = meta.iata || '';
                    } else {
                        element.iata = element.iata || '';
                    }

                    // dedupe against existing file + collected new rows
                    const key = `${element.cityDep || ''}||${element.cityDest || ''}||${element.date || ''}`;
                    if (existingKeys.has(key)) continue;
                    existingKeys.add(key);

                    // safer price parsing
                    let numericPrice = parseInt(String(element.priceFrom || '').replace(/[^\d]/g, ''));
                    if (isNaN(numericPrice)) numericPrice = 0;
                    numericPrice = Math.round((numericPrice - (numericPrice * 0.04)) + 10);

                    // arrival IATA
                    const arrIata = (element.iata || '').toLowerCase();

                    // build dates: try parse from element.date, fallback to parts
                    const parsed = parseDateRangeText(element.date || '');
                    const departDate = parsed.depart || buildDateFromParts(element.depDay, element.depMonth);
                    const returnDate = parsed.ret || buildDateFromParts(element.retDay, element.retMonth);

                    // build trip.com url (append user provided extra params)
                    const base = 'https://fr.trip.com/flights/showfarefirst';
                    const qsCore = `?dcity=${encodeURIComponent((depIata || '').toLowerCase())}&acity=${encodeURIComponent((arrIata || '').toLowerCase())}&ddate=${encodeURIComponent(departDate)}&rdate=${encodeURIComponent(returnDate)}&triptype=rt&class=y&lowpricesource=searchform&quantity=1&searchboxarg=t&nonstoponly=off&locale=fr-FR&curr=EUR`;
                    const extra = '&Allianceid=5840682&SID=157302370&trip_sub1=&trip_sub3=D6293443';
                    const tripUrl = base + qsCore + extra;

                    newRowsForCity.push([
                        element.cityDep,
                        element.countryDep,
                        element.cityDest,
                        element.countryDest,
                        (element.iata || '').toUpperCase(),
                        (depIata || '').toUpperCase(),
                        numericPrice,
                        element.date,
                        element.depDay,
                        element.depMonth,
                        element.retDay,
                        element.retMonth,
                        tripUrl
                    ]);
                } // end for each scraped item
            } // end months loop

            // After finishing months for this city: write the workbook once
            if (newRowsForCity.length > 0) {
                try {
                    outputSheet = outputWorkbook.Sheets[sheetName] || XLSX.utils.aoa_to_sheet([["cityDep","CountryDep","cityDest","countryDest","IATA","depIATA","priceFrom","date","depDay","depMonth","retDay","retMonth","tripUrl"]]);
                    XLSX.utils.sheet_add_aoa(outputSheet, newRowsForCity, { origin: -1 });
                    outputWorkbook.Sheets[sheetName] = outputSheet;
                    XLSX.writeFile(outputWorkbook, outputExcelFilePath);
                    console.log(`Saved ${newRowsForCity.length} new rows to ${outputExcelFilePath}`);
                } catch (writeErr) {
                    console.error('Failed to write Excel file:', writeErr.message);
                }
            } else {
                console.log('No new rows to write for', cityDep);
            }

            console.log(`--- Finished processing city: ${cityDep} ---`);
        } // end cities loop

        // await browser.close();
        console.log('Script completed.');
    } catch (err) {
        console.error('Fatal error:', err && err.message ? err.message : err);
    }
})();