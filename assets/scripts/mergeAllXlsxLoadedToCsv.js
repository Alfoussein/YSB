const XLSX = require('xlsx');
const fs = require('fs').promises;
const path = require('path');

async function getAllXlsxFiles(dir) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  const xlsxFiles = [];

  for (const file of files) {
    const res = path.resolve(dir, file.name);
    if (file.isDirectory()) {
      xlsxFiles.push(...await getAllXlsxFiles(res));
    } else if (
      file.isFile() && 
      path.extname(file.name.toLowerCase()) === '.xlsx' && 
      !file.name.startsWith('~$')
    ) {
      xlsxFiles.push(res);
    }
  }

  return xlsxFiles;
}

async function createDateSubfolderWithCleanup(baseDir) {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const dateSubfolder = path.join(baseDir, today);

  // Create the dated subfolder
  await fs.mkdir(dateSubfolder, { recursive: true });

  // Optional: Remove previous files in this folder to avoid duplicates
  try {
    const existingFiles = await fs.readdir(dateSubfolder);
    for (const file of existingFiles) {
      await fs.unlink(path.join(dateSubfolder, file));
    }
  } catch (err) {
    console.warn('Error cleaning up previous files:', err.message);
  }

  return dateSubfolder;
}

async function mergeXlsxAndConvertToCsv(inputDir, outputFile, options = {}) {
  const {
    skipHeader = true,
    mergeByDate = true,
  } = options;

  try {
    // Resolve directories
    const resolvedInputDir = path.resolve(__dirname, inputDir);
    const outputBaseDir = path.resolve(__dirname, '../others/final_result_sheets');
    
    // Create output base directory
    await fs.mkdir(outputBaseDir, { recursive: true });

    // Create dated subfolder with cleanup
    const outputDir = await createDateSubfolderWithCleanup(outputBaseDir);

    console.log('Input directory:', resolvedInputDir);
    console.log('Output directory:', outputDir);

    // Get all XLSX files
    const xlsxFiles = await getAllXlsxFiles(resolvedInputDir);

    // Deduplicate files based on their content
    const uniqueFiles = Array.from(new Set(xlsxFiles));
    console.log('Unique XLSX files:', uniqueFiles.map(f => path.basename(f)));

    if (uniqueFiles.length === 0) {
      console.warn('No XLSX files found to merge.');
      return;
    }

    let mergedData = [];
    const processedFileContents = new Set();

    for (const filePath of uniqueFiles) {
      try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON and create a hash to detect duplicates
        const data = XLSX.utils.sheet_to_json(worksheet, {header: 1});
        const dataHash = JSON.stringify(data);

        // Skip if this exact file content has been processed
        if (processedFileContents.has(dataHash)) {
          console.log(`Skipping duplicate file: ${path.basename(filePath)}`);
          continue;
        }
        processedFileContents.add(dataHash);

        console.log(`Processing file: ${path.basename(filePath)}, Rows: ${data.length}`);

        if (mergedData.length === 0) {
          mergedData = data;
        } else {
          mergedData = mergedData.concat(
            skipHeader ? data.slice(1) : data
          );
        }
      } catch (fileError) {
        console.error(`Error processing file ${path.basename(filePath)}:`, fileError);
      }
    }

    // Create merged file
    if (mergedData.length > 0) {
      const mergedWorkbook = XLSX.utils.book_new();
      const mergedWorksheet = XLSX.utils.aoa_to_sheet(mergedData);
      XLSX.utils.book_append_sheet(mergedWorkbook, mergedWorksheet, 'AllMerged');
      
      const outputPath = path.join(outputDir, outputFile);
      XLSX.writeFile(mergedWorkbook, outputPath, { bookType: 'csv' });
      
      console.log(`Created merged CSV: ${outputPath}`);
      console.log(`Total unique rows: ${mergedData.length}`);
    } else {
      console.warn('No data to create merged file.');
    }

  } catch (error) {
    console.error('Error in mergeXlsxAndConvertToCsv:', error);
  }
}

// Usage
mergeXlsxAndConvertToCsv(
  '../others/ready_sheets', 
  'allCitiesmerged.csv', 
  { 
    skipHeader: true,
    mergeByDate: true
  }
).catch(console.error);
