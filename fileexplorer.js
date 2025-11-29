const fs = require('fs');
const path = require('path');

function getFiles() {
    const projectRoot = process.cwd();
    let fileContents = [];

    // Fonction pour lire un fichier (JS ou HTML)
    function readFileIfWanted(file) {
        const fullPath = path.join(projectRoot, file);
        if (!fs.existsSync(fullPath)) return null;

        // On accepte .js + index_for_video.html uniquement
        const ext = path.extname(file).toLowerCase();
        if (ext === '.js' || file === 'index_for_video.html') {
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                return {
                    fileName: file,
                    path: fullPath,
                    content: content
                };
            } catch (error) {
                console.error(`Erreur de lecture du fichier ${file}:`, error);
                return null;
            }
        }
        return null;
    }

    // === 1. Fichiers à la racine (JS + index_for_video.html) ===
    const rootFiles = fs.readdirSync(projectRoot);
    const wantedRootFiles = rootFiles
        .map(file => {
            const ext = path.extname(file).toLowerCase();
            if (ext === '.js' || file === 'index_for_video.html') {
                return readFileIfWanted(file);
            }
            return null;
        })
        .filter(Boolean);

    // === 2. Tous les .js dans le dossier scripts ===
    const scriptsPath = path.join(projectRoot, 'scripts');
    let scriptsFiles = [];
    if (fs.existsSync(scriptsPath)) {
        const scriptsList = fs.readdirSync(scriptsPath);
        scriptsFiles = scriptsList
            .filter(file => path.extname(file).toLowerCase() === '.js')
            .map(file => {
                const fullPath = path.join(scriptsPath, file);
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    return {
                        fileName: file,
                        path: fullPath,
                        content: content
                    };
                } catch (error) {
                    console.error(`Erreur lecture ${file}:`, error);
                    return null;
                }
            })
            .filter(Boolean);
    }

    // === Combinaison finale ===
    fileContents = [...wantedRootFiles, ...scriptsFiles];

    return fileContents;
}

function saveToTextFile(fileContents) {
    let output = '### Fichiers JavaScript + index_for_video.html du projet ###\n\n';

    // Séparer racine et scripts
    const rootFiles = fileContents.filter(f => !f.path.includes('/scripts') && !f.path.includes('\\scripts'));
    const scriptsFiles = fileContents.filter(f => f.path.includes('/scripts') || f.path.includes('\\scripts'));

    if (rootFiles.length > 0) {
        output += '## Fichiers à la racine (JS + index_for_video.html) ##\n\n';
        rootFiles.forEach(file => {
            output += `### Fichier: ${file.fileName} ###\n\n`;
            output += file.content.trim();
            output += '\n\n---\n\n';
        });
    }

    if (scriptsFiles.length > 0) {
        output += '## Fichiers JS dans le dossier scripts ##\n\n';
        scriptsFiles.forEach(file => {
            output += `### Fichier: ${file.fileName} ###\n\n`;
            output += file.content.trim();
            output += '\n\n---\n\n';
        });
    }

    fs.writeFileSync('project_js_and_index.txt', output, 'utf8');
    console.log('Terminé → project_js_and_index.txt créé avec succès !');
    console.log(`Fichiers inclus : ${fileContents.length} (dont index_for_video.html si présent)`);
}

// === Exécution ===
try {
    const files = getFiles();
    if (files.length > 0) {
        saveToTextFile(files);
    } else {
        console.log('Aucun fichier trouvé (vérifie que index_for_video.html est bien à la racine)');
    }
} catch (error) {
    console.error('Erreur:', error);
}