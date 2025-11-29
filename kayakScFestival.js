// ...updated: randomized human-like delays for actions and typing...
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const randomUseragent = require('random-useragent');
require('dotenv').config();

puppeteerExtra.use(StealthPlugin());
const delay = ms => new Promise(r => setTimeout(r, ms));

// Human-like delay configuration (ms ranges)
const DELAY_CONFIG = {
    tiny: [80, 220],
    short: [300, 700],
    normal: [900, 1500],
    long: [2000, 3500],
    veryLong: [4000, 7000],
    typing: [80, 160]
};

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanDelay(type = 'normal') {
    const range = DELAY_CONFIG[type] || DELAY_CONFIG.normal;
    await delay(rand(range[0], range[1]));
}

// human-like typing (uses page.type with randomized per-character delay)
async function humanType(page, selector, text) {
    const range = DELAY_CONFIG.typing;
    const perChar = () => rand(range[0], range[1]);
    // If selector isn't present, fallback to evaluate assignment
    const el = await page.$(selector);
    if (!el) {
        await page.evaluate((sel, val) => {
            const e = document.querySelector(sel);
            if (e) {
                e.value = val;
                e.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, selector, text);
        return;
    }
    // type char-by-char with random delay
    for (const ch of text) {
        await page.type(selector, ch, { delay: perChar() });
    }
}

function normalizeKey(s) {
    if (s === undefined || s === null) return '';
    let t = String(s).trim().toLowerCase();
    t = t.replace(/[-–—]/g, ' ');
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/[^0-9a-z\s]+/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
}

function loadAirportData(csvPath) {
    const cityMap = new Map();
    if (!fs.existsSync(csvPath)) return cityMap;
    const raw = fs.readFileSync(csvPath, 'utf8');
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return cityMap;
    lines.shift();
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

// robust excel serial -> YYYY-MM-DD; also accepts Excel Date objects or string "dd/mm/yyyy"
function parseCellDate(value) {
    if (!value && value !== 0) return '';
    if (value instanceof Date && !isNaN(value)) {
        return value.toISOString().split('T')[0];
    }
    if (typeof value === 'number') {
        const days = Math.floor(value - 25569);
        const ms = days * 86400 * 1000;
        const date = new Date(ms);
        const frac = value - Math.floor(value);
        if (frac > 0) {
            const secs = Math.round(frac * 86400);
            date.setSeconds(date.getSeconds() + secs);
        }
        return date.toISOString().split('T')[0];
    }
    if (typeof value === 'string') {
        const s = value.trim();
        const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (m1) {
            const dd = m1[1].padStart(2,'0');
            const mm = m1[2].padStart(2,'0');
            let yy = m1[3];
            if (yy.length === 2) yy = '20' + yy;
            return `${yy}-${mm}-${dd}`;
        }
        const iso = new Date(s);
        if (!isNaN(iso)) return iso.toISOString().split('T')[0];
    }
    return '';
}

// navigate back to search form using the specific Go back button
async function goBackToForm(page) {
    try {
        // Wait for results page to ensure back button is present
        await page.waitForSelector('.MU1_-content', { timeout: 5000 }).catch(() => {});
        await humanDelay('short');
        
        // Click the specific Go back button
        const backBtnSelectors = [
            'div[role="button"].yeiN[aria-label="Go back"]',
            '.yeiN[aria-label="Go back"]',
            'div[aria-label="Go back"]'
        ];
        let backBtn = null;
        for (const sel of backBtnSelectors) {
            backBtn = await page.$(sel);
            if (backBtn) break;
        }
        
        if (backBtn) {
            console.log('Clicking Go back button...');
            // emulate a human move + click
            try {
                const box = await backBtn.boundingBox();
                if (box) {
                    await page.mouse.move(box.x + box.width/2 + rand(-5,5), box.y + box.height/2 + rand(-5,5));
                    await humanDelay('tiny');
                    await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
                } else {
                    await backBtn.click();
                }
            } catch (e) {
                await backBtn.click().catch(()=>{});
            }
            await humanDelay('long'); // ensure form reloads
            // Verify we're back on form (check for location inputs)
            await page.waitForSelector('.xGVG-location-inputs input', { timeout: 5000 }).catch(() => {
                console.warn('Back navigation: form elements not found immediately');
            });
        } else {
            console.warn('Go back button not found, falling back to Escape key');
            await page.keyboard.press('Escape');
            await humanDelay('normal');
        }
    } catch (err) {
        console.warn('Go back failed:', err.message);
        // Last resort: reload explore page
        await page.goto('https://www.kayak.com/explore/', { waitUntil: 'networkidle2' });
        await humanDelay('long');
    }
}

// helper: clear input reliably then type + handle c4Gq3 suggestions
async function clearThenType(page, selector, text, { isC4 = false } = {}) {
    // ensure selector present
    try { await page.waitForSelector(selector, { visible: true, timeout: 2500 }); } catch (e) { /* continue */ }

    // try several times to clear previous value
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await page.focus(selector).catch(()=>{});
            await humanDelay('tiny');
            // Select all + delete (Windows)
            await page.keyboard.down('Control');
            await page.keyboard.press('A');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            // fallback JS clear & input event
            await page.evaluate(sel => {
                const el = document.querySelector(sel);
                if (el) {
                    try { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e) {}
                }
            }, selector).catch(()=>{});
            await humanDelay('short');
            const cur = await page.$eval(selector, el => (el && el.value) ? String(el.value).trim() : '', { timeout: 1000 }).catch(()=> '');
            if (!cur) break;
        } catch (e) {
            // small delay then retry
            await humanDelay('tiny');
        }
    }

    // type human-like
    await humanType(page, selector, text);
    await humanDelay('short');

    if (isC4) {
        // wait for suggestion list and click first item
        try {
            await page.waitForSelector('.c4Gq3-content ul#smarty-list li', { visible: true, timeout: 4500 });
            const firstOpt = await page.$('.c4Gq3-content ul#smarty-list li');
            if (firstOpt) {
                const b = await firstOpt.boundingBox().catch(()=>null);
                if (b) {
                    await page.mouse.move(b.x + Math.floor(Math.random() * (b.width-6)) + 3, b.y + Math.floor(Math.random() * (b.height-6)) + 3);
                    await humanDelay('tiny');
                    await page.mouse.click(b.x + b.width/2, b.y + b.height/2);
                } else {
                    await firstOpt.click().catch(()=>{});
                }
                await humanDelay('normal');
                return;
            }
        } catch (e) {
            // fallback to Enter if suggestions didn't appear
        }
    }

    // default: press Enter to accept suggestion
    try { await page.keyboard.press('Enter'); } catch(e) {}
    await humanDelay('normal');
}

(async () => {
    try {
        const inputXlsx = path.join(__dirname, 'assets', 'others', 'anywhere_flights_festival.xlsx');
        if (!fs.existsSync(inputXlsx)) {
            console.error(`Input XLSX not found: ${inputXlsx}`);
            return;
        }

        const wbIn = XLSX.readFile(inputXlsx);
        const shIn = wbIn.Sheets[wbIn.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(shIn, { header: 1 });

        if (!rows || rows.length < 2) {
            console.error('Input has no data.');
            return;
        }

        // header mapping
        const header = rows[0].map(h => String(h || '').trim());
        const idxCityDep = header.findIndex(h => /city\s*dep/i.test(h)) !== -1 ? header.findIndex(h => /city\s*dep/i.test(h)) : 0;
        const idxCityDest = header.findIndex(h => /city\s*dest/i.test(h)) !== -1 ? header.findIndex(h => /city\s*dest/i.test(h)) : 1;
        const idxDate = header.findIndex(h => /date/i.test(h)) !== -1 ? header.findIndex(h => /date/i.test(h)) : 2;
        const idxEvent = header.findIndex(h => /event/i.test(h)) !== -1 ? header.findIndex(h => /event/i.test(h)) : 3;

        const entries = rows.slice(1).map(r => ({
            cityDep: String(r[idxCityDep] || '').trim(),
            cityDest: String(r[idxCityDest] || '').trim(),
            rawDate: r[idxDate],
            event: String(r[idxEvent] || '').trim()
        })).filter(e => e.cityDep && e.cityDest);

        if (!entries.length) {
            console.error('No valid rows found.');
            return;
        }

        const airportCsvPath = path.join(__dirname, 'assets', 'others', 'airport_Europe.csv');
        const cityMap = loadAirportData(airportCsvPath);

        const browser = await puppeteerExtra.launch({ headless: false });
        const page = await browser.newPage();
        await page.setUserAgent(randomUseragent.getRandom());
        await page.setViewport({ width: 1366, height: 900 });

        await page.goto('https://www.kayak.com/explore/', { waitUntil: 'networkidle2' });
        await humanDelay('long');

        // reject cookies (same selector as kayakSc.js)
        try {
            await humanDelay('short');
            const cookiesButton = await page.$('.P4zO-submit-buttons button:nth-child(3)');
            if (cookiesButton) {
                // click more human-like
                const box = await cookiesButton.boundingBox();
                if (box) {
                    await page.mouse.move(box.x + rand(1, box.width-1), box.y + rand(1, box.height-1));
                    await humanDelay('tiny');
                    await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
                } else {
                    await cookiesButton.click().catch(()=>{});
                }
                await humanDelay('short');
            }
        } catch (e) { /* ignore */ }

        // Prepare output workbook (copy input, write to updated file)
        const outFile = path.join(__dirname, 'assets', 'others', 'ready_sheets', 'updated_anywhere_flights_festival.xlsx');
        let outWb = XLSX.readFile(inputXlsx);
        let outSh = outWb.Sheets[outWb.SheetNames[0]];
        let outData = XLSX.utils.sheet_to_json(outSh, { header: 1 });

        if (!outData[0].includes('Price (USD)')) outData[0].push('Price (USD)');

        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const rowIndex = i + 1; // account for header row

            const parsedDate = parseCellDate(e.rawDate) || '';
            console.log(`Processing ${e.cityDep} -> ${e.cityDest} date ${parsedDate || '(no parsed date)'} event ${e.event}`);

            // Lookup destination IATA
            let destMeta = cityMap.get(normalizeKey(e.cityDest));
            if (!destMeta) {
                for (const [k, v] of cityMap.entries()) {
                    if (!k) continue;
                    const nk = normalizeKey(e.cityDest);
                    if (nk.includes(k) || k.includes(nk)) { destMeta = v; break; }
                }
            }
            if (!destMeta || !destMeta.iata) {
                console.log(`Skipping ${e.cityDest}: no IATA found.`);
                outData[rowIndex] = outData[rowIndex] || [];
                outData[rowIndex][outData[0].length - 1] = '';
                outSh = XLSX.utils.aoa_to_sheet(outData);
                outWb.Sheets[outWb.SheetNames[0]] = outSh;
                XLSX.writeFile(outWb, outFile);
                // Go back to form and continue
                try { await goBackToForm(page); } catch(_) {}
                await humanDelay('normal');
                continue;
            }

            // 1) Fill origin input first
            try {
                await humanDelay('short');
                const originSelectorVariants = [
                    '.xGVG-location-inputs .xGVG-input:first-child input',
                    '.xGVG-location-inputs input.NhpT',
                    '.xGVG-location-inputs input',
                    '.c4Gq3-input input.NhpT' // add c4Gq3 variant
                ];
                let originSel = null;
                for (const s of originSelectorVariants) {
                    const el = await page.$(s);
                    if (el) { originSel = s; break; }
                }
                if (!originSel) originSel = '.xGVG-location-inputs input';

                // new: reliable clear + type + handle c4Gq3 suggestion
                await clearThenType(page, originSel, e.cityDep, { isC4: originSel.includes('c4Gq3') });
                
                // focus and clear
                await page.click(originSel, { clickCount: 3 }).catch(()=>{});
                await humanDelay('tiny');
                await page.evaluate(sel => { const el = document.querySelector(sel); if (el) el.value = ''; }, originSel).catch(()=>{});
                await humanDelay('tiny');
                // human typing
                await humanType(page, originSel, e.cityDep);
                await humanDelay('short');

                // If the input is the c4Gq3 variant we click the first list item instead of pressing Enter
                if (originSel.includes('c4Gq3')) {
                    // wait for suggestion list and click first li#smarty-list > li
                    try {
                        await page.waitForSelector('.c4Gq3-content ul#smarty-list li', { visible: true, timeout: 4000 });
                        const firstOpt = await page.$('.c4Gq3-content ul#smarty-list li');
                        if (firstOpt) {
                            const b = await firstOpt.boundingBox();
                            if (b) {
                                await page.mouse.move(b.x + Math.floor(Math.random() * (b.width-4)) + 2, b.y + Math.floor(Math.random() * (b.height-4)) + 2);
                                await humanDelay('tiny');
                                await page.mouse.click(b.x + b.width/2, b.y + b.height/2);
                            } else {
                                await firstOpt.click().catch(()=>{});
                            }
                            await humanDelay('normal');
                        } else {
                            // fallback to Enter if no option found
                            await page.keyboard.press('Enter');
                            await humanDelay('normal');
                        }
                    } catch (err) {
                        // fallback to Enter on timeout/error
                        await page.keyboard.press('Enter');
                        await humanDelay('normal');
                    }
                } else {
                    // default behavior for xGVG inputs: press Enter
                    await page.keyboard.press('Enter');
                    await humanDelay('normal');
                }
            } catch (err) {
                console.warn('origin input issue:', err.message);
            }

            // 2) THEN set dates (if parsed) - robust navigation and exact dates selection
            if (parsedDate) {
                try {
                    await humanDelay('short');
                    const dateBtn = await page.$('[aria-label="Select dates"], [aria-label="Dates"], .D4Yk');
                    if (dateBtn) {
                        console.log('Opening date picker...');
                        await dateBtn.click().catch(()=>{});
                        await page.waitForSelector('.or3C-wrapper, .sGVi-dropdown-content', { visible: true, timeout: 5000 }).catch(()=>{});
                        await humanDelay('normal');

                        // Select "Exact dates" radio button if present
                        const exactDatesLabel = await page.$('label[for="exact-dates"], label[data-text="Exact dates"]');
                        if (exactDatesLabel) {
                            console.log('Selecting Exact dates...');
                            await exactDatesLabel.click().catch(()=>{});
                            await humanDelay('short');
                        }

                        // Navigate to November 2025 if needed
                        let currentMonthCaption = await page.evaluate(() => {
                            const cap = document.querySelector('.w0lb-month-name');
                            return cap ? cap.textContent.trim() : '';
                        });
                        console.log('Current month:', currentMonthCaption);
                        const targetMonth = 'November 2025';
                        let attempts = 0;
                        while (!currentMonthCaption.includes(targetMonth) && attempts < 10) {
                            attempts++;
                            const nextBtn = await page.$('div[aria-label="Next Month"], .c1fvi-mod-theme-button:not(.c1fvi-disabled)');
                            if (nextBtn) {
                                console.log('Clicking Next Month...');
                                try {
                                    const b = await nextBtn.boundingBox();
                                    if (b) {
                                        await page.mouse.move(b.x + rand(1, b.width-1), b.y + rand(1, b.height-1));
                                        await humanDelay('tiny');
                                        await page.mouse.click(b.x + b.width/2, b.y + b.height/2);
                                    } else {
                                        await nextBtn.click().catch(()=>{});
                                    }
                                } catch (e) { await nextBtn.click().catch(()=>{}); }
                                await humanDelay('normal');
                            } else {
                                const prevBtn = await page.$('div[aria-label="Previous month"], .c1fvi-disabled');
                                if (prevBtn && !await page.evaluate(el => el.getAttribute('aria-disabled') === 'true', prevBtn)) {
                                    console.log('Clicking Previous Month...');
                                    await prevBtn.click().catch(()=>{});
                                    await humanDelay('normal');
                                } else {
                                    console.warn('Cannot navigate to target month:', targetMonth);
                                    break;
                                }
                            }
                            currentMonthCaption = await page.evaluate(() => {
                                const cap = document.querySelector('.w0lb-month-name');
                                return cap ? cap.textContent.trim() : '';
                            });
                            console.log('Updated month:', currentMonthCaption);
                        }

                        // Select start and end dates (festival fixed)
                        const startLabel = 'November 6, 2025';
                        const endLabel = 'November 10, 2025';
                        const startBtn = await page.$(`div[aria-label="${startLabel}"], div[aria-label*="${startLabel}"]`);
                        if (startBtn) {
                            console.log('Selecting start date:', startLabel);
                            try {
                                const b = await startBtn.boundingBox();
                                if (b) {
                                    await page.mouse.move(b.x + rand(1, b.width-1), b.y + rand(1, b.height-1));
                                    await humanDelay('tiny');
                                    await page.mouse.click(b.x + b.width/2, b.y + b.height/2);
                                } else {
                                    await startBtn.click().catch(()=>{});
                                }
                            } catch (e) { await startBtn.click().catch(()=>{}); }
                            await humanDelay('short');
                        } else {
                            console.warn('Start date button not found');
                        }

                        const endBtn = await page.$(`div[aria-label="${endLabel}"], div[aria-label*="${endLabel}"]`);
                        if (endBtn) {
                            console.log('Selecting end date:', endLabel);
                            try {
                                const b = await endBtn.boundingBox();
                                if (b) {
                                    await page.mouse.move(b.x + rand(1, b.width-1), b.y + rand(1, b.height-1));
                                    await humanDelay('tiny');
                                    await page.mouse.click(b.x + b.width/2, b.y + b.height/2);
                                } else {
                                    await endBtn.click().catch(()=>{});
                                }
                            } catch (e) { await endBtn.click().catch(()=>{}); }
                            await humanDelay('short');
                        } else {
                            console.warn('End date button not found');
                        }

                        // Close date picker (Done/Apply)
                        const doneSelectors = [
                            '.RxNS-button-content',
                            '.CjDg .RxNS-button-content',
                            'button[data-test="datepicker-done"]',
                            'button[aria-label*="Done"], button[aria-label*="Apply"]'
                        ];
                        let doneBtn = null;
                        for (const sel of doneSelectors) {
                            doneBtn = await page.$(sel);
                            if (doneBtn) break;
                        }
                        if (doneBtn) {
                            console.log('Clicking Done on date picker...');
                            try {
                                const b = await doneBtn.boundingBox();
                                if (b) {
                                    await page.mouse.move(b.x + rand(1, b.width-1), b.y + rand(1, b.height-1));
                                    await humanDelay('tiny');
                                    await page.mouse.click(b.x + b.width/2, b.y + b.height/2);
                                } else {
                                    await doneBtn.click().catch(()=>{});
                                }
                            } catch (e) { await doneBtn.click().catch(()=>{}); }
                            await humanDelay('normal');
                        } else {
                            console.warn('Done button not found, trying Escape');
                            await page.keyboard.press('Escape');
                            await humanDelay('short');
                        }
                    } else {
                        console.warn('Date picker button not found');
                    }
                } catch (err) {
                    console.warn('date picker issue:', err.message);
                }
            }

            // 3) THEN fill destination input
            try {
                await humanDelay('short');
                const destSelectorVariants = [
                    '.xGVG-location-inputs .xGVG-input:last-child input',
                    '.xGVG-location-inputs input.NhpT:last-of-type',
                    '.xGVG-location-inputs input'
                ];
                let destSel = null;
                for (const s of destSelectorVariants) {
                    const el = await page.$(s);
                    if (el) { destSel = s; break; }
                }
                if (!destSel) destSel = '.xGVG-location-inputs input';
                // new: reliable clear + type + handle c4Gq3 suggestion for destination
                await clearThenType(page, destSel, e.cityDest, { isC4: destSel.includes('c4Gq3') });
                
                await page.click(destSel, { clickCount: 3 }).catch(()=>{});
                await humanDelay('tiny');
                await page.evaluate(sel => { const el = document.querySelector(sel); if (el) el.value = ''; }, destSel).catch(()=>{});
                await humanDelay('tiny');
                await humanType(page, destSel, e.cityDest);
                await humanDelay('short');
                await page.keyboard.press('Enter');
                await humanDelay('normal');
            } catch (err) {
                console.warn('dest input issue:', err.message);
            }

            // Click Search
            try {
                await humanDelay('short');
                const searchBtn = await page.$('button[type="submit"], button[aria-label="Search"], button[data-test="search-button"]');
                if (searchBtn) { 
                    console.log('Clicking Search...');
                    const b = await searchBtn.boundingBox();
                    if (b) {
                        await page.mouse.move(b.x + rand(1, b.width-1), b.y + rand(1, b.height-1));
                        await humanDelay('tiny');
                        await page.mouse.click(b.x + b.width/2, b.y + b.height/2);
                    } else {
                        await searchBtn.click().catch(()=>{});
                    }
                    await humanDelay('veryLong'); 
                } else {
                    console.warn('Search button not found, waiting...');
                    await humanDelay('veryLong');
                }
            } catch (err) {
                console.warn('search click/wait issue:', err.message);
                await humanDelay('veryLong');
            }

            // Extract price - wait for results
            let price = '';
            try {
                await page.waitForSelector('.MU1_-content, .wMQR-header', { timeout: 12000 }).catch(() => {
                    console.warn('Results page not loaded in time');
                });
                await humanDelay('short');
                price = await page.evaluate(() => {
                    const selectors = [
                        '.f8F9-price', '.price', '.resultPrice', '.ksr-price', '.gws-price',
                        '.MU1_-content .price', '.resultsList .price', '.wMQR-header'
                    ];
                    for (const s of selectors) {
                        const el = document.querySelector(s);
                        if (!el) continue;
                        const txt = (el.textContent || el.innerText || '').replace(/\s+/g,' ');
                        const m = txt.match(/\$?\s*([0-9]{1,3}(?:[,.][0-9]{3})*(?:[,.][0-9]+)?)/);
                        if (m) return m[1].replace(/,/g,'').replace(/\s/g,'');
                    }
                    const all = document.body.innerText || '';
                    const m = all.match(/\$\s*([0-9]{2,6})/);
                    return m ? m[1] : '';
                });
                console.log(`Extracted price for ${e.cityDep} -> ${e.cityDest}: $${price || 'N/A'}`);
            } catch (err) {
                console.warn('price extraction issue:', err.message);
                price = '';
            }

            outData[rowIndex] = outData[rowIndex] || [];
            outData[rowIndex][outData[0].length - 1] = price || '';

            // write progress after each row
            outSh = XLSX.utils.aoa_to_sheet(outData);
            outWb.Sheets[outWb.SheetNames[0]] = outSh;
            XLSX.writeFile(outWb, outFile);

            // Go back to form using the back button (replaces full reload)
            try {
                await goBackToForm(page);
                await humanDelay('normal');
            } catch (err) {
                console.warn('goBackToForm failed:', err.message);
            }

            // small jitter before next iteration
            await humanDelay('short');
        } // end loop

        await browser.close();
        console.log('Done — updated file:', outFile);
    } catch (err) {
        console.error('Fatal:', err && err.message ? err.message : err);
    }
})();