import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, 'src-tauri', 'icons');

async function generateIco() {
  console.log('Generating Windows .ico file...');

  const pngFiles = [
    path.join(iconsDir, '32x32.png'),
    path.join(iconsDir, '128x128.png'),
    path.join(iconsDir, '256x256.png')
  ];

  const buf = await pngToIco(pngFiles);
  const outputPath = path.join(iconsDir, 'icon.ico');
  fs.writeFileSync(outputPath, buf);

  console.log('✅ Generated icon.ico successfully!');
}

generateIco().catch(console.error);
