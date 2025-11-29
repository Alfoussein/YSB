const fs = require('fs');
const csv = require('csv-parser');
const puppeteer = require('puppeteer');
const { createObjectCsvWriter } = require('csv-writer');

const cityData = {};

async function readCitiesFromCSV() {
  const datasFromCSV = new Set();
  return new Promise((resolve, reject) => {
    fs.createReadStream('european_airports_filtered.csv')
      .pipe(csv())
      .on('data', (row) => {
        if (!datasFromCSV.has(row.city)) {
          datasFromCSV.add({city : row.city, country : row.country});
          cityData[row.city] = { ...row };
        }
      })
      .on('end', () => {
        console.log('CSV file successfully processed');
        resolve(Array.from(datasFromCSV));
      })
      .on('error', reject);
  });
}

async function writeOutputToCSV() {
  const csvWriter = createObjectCsvWriter({
    path: 'outputCheckCheck.csv',
    header: [
      {id: 'index', title: 'index'},
      {id: 'airport', title: 'airport'},
      {id: 'city', title: 'city'},
      {id: 'country', title: 'country'},
      {id: 'iata', title: 'iata'},
      {id: 'ICAO', title: 'ICAO'},
      {id: 'lat', title: 'lat'},
      {id: 'long', title: 'long'},
      {id: 'altitude', title: 'altitude'},
      {id: 'foundIATA', title: 'foundIATA'}
    ]
  });

  const records = Object.entries(cityData).map(([city, data]) => ({
    ...data,
    foundIATA: data.foundIATA || 'Not found'
  }));

  await csvWriter.writeRecords(records);
  console.log('Output CSV file has been written successfully');
}

async function performActions() {
  const datasFromCSV = await readCitiesFromCSV();
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('https://www.kayak.com/explore/LON-anywhere');

  for (let i = 0; i < datasFromCSV.length; i++) {
    await processCity(page, datasFromCSV[i]);
  }

  console.log("Toutes les actions sont terminées.");
  await writeOutputToCSV();

  await browser.close();
}

let delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function processCity(page, csvDatas) {
  try {
    await delay(2000);

    
    // Handle cookies popup if present
    const cookiesPresent = await page.evaluate(async() => {

      let delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        const clickEvent = await new MouseEvent('click', {
          bubbles: true,  // Whether the event bubbles up through the DOM
          cancelable: true,  // Whether the event can be canceled
      });



      let coockies = await document.querySelectorAll(".c1yxs.c1yxs-mod-visible")
      if(coockies.length > 0) {await delay(5000);await document.querySelectorAll(".P4zO-submit-buttons")[0].children[2].dispatchEvent(clickEvent)}


      });

      await delay(1700);
    

    // Click on the input field
    let inpp = await page.$$("._ibT");
    await inpp[0].click();
    await delay(1600);

    // Clear the input field and type the city name
    let getIdFromChild = await page.evaluate(() => {
      return document.querySelector("._ibT").children[0].id;
    });
    const parts = await getIdFromChild.split("-");
    const firstValue = await parts[0];
    let inputFound = await page.$(`#${firstValue}-origin`);
    await delay(1600);
    await page.evaluate((el) => { el.value = ''; }, inputFound);

    const text = csvDatas.city;
    for (const char of text) {
      await inputFound.type(char);
      await delay(100);
    }

    await delay(1000);

    // Trigger mousedown and mouseup events
    await page.evaluate(async(el) => {
      const mousedownEvent = await new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0, // Left mouse button
        buttons: 1,
    });
    
    // Create a mouseup event for left-click
    const mouseupEvent = await new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        button: 0, // Left mouse button
        buttons: 1,
    });
      el.dispatchEvent(mousedownEvent);
      el.dispatchEvent(mouseupEvent);
    }, inputFound);

    await delay(100);


  


    // Récupération des informations IATA
    const getIataCode = await page.evaluate(async (csvDatas) => {

      let checkCountryMatch = (targetWord, inputWord) => {

        const matchCount =[...targetWord].filter(char => inputWord.includes(char)).length ;
        const matchThreshold = Math.ceil(targetWord.length * 2 / 3);
        return matchCount >= matchThreshold ? true : false ;

    }
    

      const dropDownListUl = document.querySelector('.flight-smarty');

      if (dropDownListUl) {

        const firstElementUl = dropDownListUl.children[0];
        let checkIfcountryExistIDropList = firstElementUl.children[0].innerHTML.includes(csvDatas.country)
        let selectTheCountryInDropList = firstElementUl.children[0].innerHTML.split(",")

        let checkCountry = await checkCountryMatch(selectTheCountryInDropList[2], csvDatas.country);
        
        if (firstElementUl && checkIfcountryExistIDropList || checkCountry) {
          const iataElement = firstElementUl.querySelector('.airportCode');
          if (iataElement) {
            return {iataCode:iataElement.textContent.trim(), country : selectTheCountryInDropList[2]};
          }
        }
      }
      return null;
    }, csvDatas);

    if (getIataCode) {
      cityData[csvDatas.city].foundIATA = getIataCode.iataCode;
      cityData[csvDatas.city].country = getIataCode.country;
      console.log(`IATA trouvé pour : ${getIataCode.iataCode}`);
    } else {
      console.log(`IATA non trouvé pour =============: ${csvDatas.city}`);
    }

    console.log(`Traitement terminé pour : ${csvDatas.city}`);

  } catch (error) {
    console.error(`Erreur lors du traitement de ${csvDatas.city}:`, error);
  }

  
}

performActions().catch(error => console.error("Une erreur est survenue :", error));
