const fs = require('fs');
const Papa = require('papaparse');

// Liste des pays d'Europe en anglais
const europeanCountries = [
  "Albania", "Andorra", "Armenia", "Austria", "Azerbaijan", "Belgium", "Bosnia and Herzegovina", "Bulgaria", "Cyprus", 
  "Croatia", "Denmark", "Estonia", "Finland", "France", "Georgia", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy", 
  "Kazakhstan", "Kosovo", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Moldova", "Monaco", "Montenegro", 
  "Netherlands", "Macedonia", "Norway", "Poland", "Portugal", "Romania", "Russia", "San Marino", "Serbia", "Slovakia", 
  "Slovenia", "Spain", "Sweden", "Switzerland", "Turkey", "Ukraine", "United Kingdom", "Vatican City"
];

// Liste des mots à exclure dans la colonne 'airport'
const excludeKeywords = [
  "heliport", "Air Base", "Airfield", "Army", "Academy"
];

// Fonction pour vérifier si un pays est européen
function isEuropeanCountry(country) {
  return europeanCountries.includes(country);
}

// Fonction pour vérifier si une ligne doit être exclue (iata == "\N" ou mots dans 'airport')
function shouldExcludeRow(row) {
  // Exclure si iata == "\N"
  if (row['iata'] === '\\N') {
    return true;
  }

  // Exclure si l'élément dans 'airport' contient des mots à exclure
  if (excludeKeywords.some(keyword => row['airport'] && row['airport'].toLowerCase().includes(keyword.toLowerCase()))) {
    return true;
  }

  return false;
}

// Fonction pour analyser et filtrer les pays européens
function parseCSVFile(csvContent) {
  const parsedData = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  
  // Filtrer les lignes qui sont européennes et ne sont pas exclues
  const europeanAirports = parsedData.data.filter(row => {
    return isEuropeanCountry(row['country']) && !shouldExcludeRow(row);
  });

  // Générer un nouveau CSV avec les pays européens
  const outputCSV = Papa.unparse(europeanAirports);
  
  // Enregistrer le résultat dans un nouveau fichier
  fs.writeFile('european_airports_filtered.csv', outputCSV, (err) => {
    if (err) {
      console.error('Erreur lors de l\'écriture du fichier CSV :', err);
    } else {
      console.log('Fichier CSV créé avec succès : european_airports_filtered.csv');
    }
  });
}

// Lire le fichier CSV (remplace par le chemin de ton fichier CSV)
const filePath = 'airport.csv';

fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Erreur lors de la lecture du fichier CSV :', err);
    return;
  }
  parseCSVFile(data);
});
