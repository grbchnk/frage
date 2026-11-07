const fs = require('fs');
const path = require('path');
const { Resvg } = require('./render-tools/node_modules/@resvg/resvg-js');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'assets', 'cards');
for (const name of fs.readdirSync(folder).filter(n => n.endsWith('.svg'))) {
  const r = new Resvg(fs.readFileSync(path.join(folder, name)), { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } });
  fs.writeFileSync(path.join(folder, name.replace(/\.svg$/, '.png')), r.render().asPng());
}
console.log('15 PNG cards rendered');
