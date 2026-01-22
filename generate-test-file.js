// Generate a large test file for WASM testing
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputPath = path.join(__dirname, 'test-large-file.json');
const targetSize = 25 * 1024 * 1024; // 25MB

console.log('Generating large test file (25MB)...');
console.log('Output:', outputPath);

// Generate a large JSON array with test data
const stream = fs.createWriteStream(outputPath);

stream.write('{\n  "testData": [\n');

let currentSize = 0;
let itemCount = 0;

while (currentSize < targetSize) {
  const item = {
    id: itemCount,
    timestamp: new Date().toISOString(),
    name: `Test Item ${itemCount}`,
    description: `This is test item number ${itemCount} with some sample data to increase file size. `.repeat(10),
    metadata: {
      category: `Category ${itemCount % 100}`,
      tags: [`tag${itemCount % 10}`, `tag${itemCount % 20}`, `tag${itemCount % 30}`],
      score: Math.random() * 100,
      active: itemCount % 2 === 0,
      nested: {
        level1: {
          level2: {
            level3: {
              data: `Deep nested data for item ${itemCount}`
            }
          }
        }
      }
    }
  };

  const itemStr = (itemCount > 0 ? ',\n' : '') + '    ' + JSON.stringify(item, null, 2).split('\n').join('\n    ');
  stream.write(itemStr);

  currentSize += Buffer.byteLength(itemStr, 'utf8');
  itemCount++;

  // Progress update every 1000 items
  if (itemCount % 1000 === 0) {
    console.log(`  Generated ${itemCount.toLocaleString()} items, ${(currentSize / 1024 / 1024).toFixed(2)}MB`);
  }
}

stream.write('\n  ]\n}\n');
stream.end();

stream.on('finish', () => {
  const stats = fs.statSync(outputPath);
  console.log('\n✓ Test file generated successfully!');
  console.log(`  Items: ${itemCount.toLocaleString()}`);
  console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  Path: ${outputPath}`);
  console.log('\nYou can now open this file in the app to test WASM loading.');
});

stream.on('error', (error) => {
  console.error('✗ Error generating file:', error);
  process.exit(1);
});
