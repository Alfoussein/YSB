// download-flags.js — Télécharge tous les drapeaux du monde en 1 clic
const https = require('https');
const fs = require('fs');
const path = require('path');

const folder = path.join(__dirname, 'assets', 'flags');
if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

const countries = [
  "ad","ae","af","ag","ai","al","am","ao","aq","ar","as","at","au","aw","ax","az",
  "ba","bb","bd","be","bf","bg","bh","bi","bj","bl","bm","bn","bo","bq","br","bs",
  "bt","bv","bw","by","bz","ca","cc","cd","cf","cg","ch","ci","ck","cl","cm","cn",
  "co","cr","cu","cv","cw","cx","cy","cz","de","dj","dk","dm","do","dz","ec","ee",
  "eg","eh","er","es","et","fi","fj","fk","fm","fo","fr","ga","gb","gd","ge","gf",
  "gg","gh","gi","gl","gm","gn","gp","gq","gr","gs","gt","gu","gw","gy","hk","hm",
  "hn","hr","ht","hu","id","ie","il","im","in","io","iq","ir","is","it","je","jm",
  "jo","jp","ke","kg","kh","ki","km","kn","kp","kr","kw","ky","kz","la","lb","lc",
  "li","lk","lr","ls","lt","lu","lv","ly","ma","mc","md","me","mf","mg","mh","mk",
  "ml","mm","mn","mo","mp","mq","mr","ms","mt","mu","mv","mw","mx","my","mz","na",
  "nc","ne","nf","ng","ni","nl","no","np","nr","nu","nz","om","pa","pe","pf","pg",
  "ph","pk","pl","pm","pn","pr","ps","pt","pw","py","qa","re","ro","rs","ru","rw",
  "sa","sb","sc","sd","se","sg","sh","si","sj","sk","sl","sm","sn","so","sr","ss",
  "st","sv","sx","sy","sz","tc","td","tf","tg","th","tj","tk","tl","tm","tn","to",
  "tr","tt","tv","tw","tz","ua","ug","um","us","uy","uz","va","vc","ve","vg","vi",
  "vn","vu","wf","ws","xk","ye","yt","za","zm","zw"
];

let completed = 0;
const total = countries.length;

console.log(`Téléchargement de ${total} drapeaux...`);

countries.forEach(code => {
  const url = `https://flagcdn.com/256x192/${code}.png`;
  const filePath = path.join(folder, `${code}.png`);

  https.get(url, (res) => {
    if (res.statusCode === 200) {
      const file = fs.createWriteStream(filePath);
      res.pipe(file);
      file.on('finish', () => {
        completed++;
        console.log(`OK ${code}.png (${completed}/${total})`);
        if (completed === total) console.log('Tous les drapeaux téléchargés !');
      });
    } else {
      console.log(`Erreur 404 pour ${code}`);
    }
  }).on('error', (e) => {
    console.error(`Erreur ${code}:`, e.message);
  });
});