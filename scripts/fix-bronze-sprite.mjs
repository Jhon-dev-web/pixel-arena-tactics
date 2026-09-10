import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'fs';

const URL_SRC = 'https://agent8-games.verse8.io/0xb403fd66835cca17056ced56df7eadfe642c2e41/mcp-uploads/static-assets/spritesheet-1787762342830.png';
const OUT = 'public/assets/spritesheets/bronze.png';

function isMagentaSpill(r, g, b) {
  // The matte spill/noise left over from chroma-key removal is magenta/pink: R and B both
  // well above G (sampled cluster ~184,54,147). Real character colors (skin, leather, metal)
  // never have B this far above G, so this rule won't eat legitimate opaque pixels.
  return r > 120 && b > 90 && g < 130 && r > g + 45 && b > g + 30;
}

const res = await fetch(URL_SRC);
const buf = Buffer.from(await res.arrayBuffer());
const png = PNG.sync.read(buf);
const { width, height, data } = png;

let cleared = 0;
for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (data[i + 3] > 0 && isMagentaSpill(r, g, b)) {
    data[i + 3] = 0;
    cleared++;
  }
}
console.log('cleared pixels:', cleared, '/', width * height);

mkdirSync('public/assets/spritesheets', { recursive: true });
writeFileSync(OUT, PNG.sync.write(png));
console.log('wrote', OUT);
