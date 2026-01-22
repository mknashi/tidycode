import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: '256x256.png', size: 256 },
  { name: '512x512.png', size: 512 },
  { name: 'icon.png', size: 512 }
];

const iconsetSizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 }
];

const svgPath = path.join(__dirname, 'public', 'tidycode-logo.svg');
const iconsDir = path.join(__dirname, 'src-tauri', 'icons');
const iconsetDir = path.join(iconsDir, 'icon.iconset');

// Ensure iconset directory exists
if (!fs.existsSync(iconsetDir)) {
  fs.mkdirSync(iconsetDir, { recursive: true });
}

async function generateIcons() {
  console.log('Generating desktop icons from SVG...');

  // Generate main icon sizes
  for (const { name, size } of sizes) {
    const outputPath = path.join(iconsDir, name);
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✓ Generated ${name} (${size}x${size})`);
  }

  // Generate iconset sizes for macOS
  for (const { name, size } of iconsetSizes) {
    const outputPath = path.join(iconsetDir, name);
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✓ Generated iconset/${name} (${size}x${size})`);
  }

  console.log('\n✅ All icons generated successfully!');
  console.log('\nNext steps:');
  console.log('1. Run: iconutil -c icns src-tauri/icons/icon.iconset -o src-tauri/icons/icon.icns');
  console.log('2. For Windows .ico, you may need a separate tool or online converter');
}

generateIcons().catch(console.error);
