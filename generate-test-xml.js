// Generate a large XML file for WASM testing (18MB)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputPath = path.join(__dirname, 'test-large-file.xml');
const targetSize = 18 * 1024 * 1024; // 18MB

console.log('Generating large test XML file (18MB)...');
console.log('Output:', outputPath);

// Generate a large XML file with test data
const stream = fs.createWriteStream(outputPath);

stream.write('<?xml version="1.0" encoding="UTF-8"?>\n');
stream.write('<testData>\n');
stream.write('  <metadata>\n');
stream.write('    <generator>TidyCode Test Generator</generator>\n');
stream.write('    <timestamp>' + new Date().toISOString() + '</timestamp>\n');
stream.write('    <targetSize>18MB</targetSize>\n');
stream.write('    <description>Large XML file for WASM loading and performance testing</description>\n');
stream.write('  </metadata>\n');
stream.write('  <items>\n');

let currentSize = 0;
let itemCount = 0;

// Calculate approximate header size
const headerSize = Buffer.byteLength('<?xml version="1.0" encoding="UTF-8"?>\n<testData>\n  <metadata>\n    <generator>TidyCode Test Generator</generator>\n    <timestamp>' + new Date().toISOString() + '</timestamp>\n    <targetSize>18MB</targetSize>\n    <description>Large XML file for WASM loading and performance testing</description>\n  </metadata>\n  <items>\n', 'utf8');
currentSize = headerSize;

while (currentSize < targetSize) {
  const item = `    <item id="${itemCount}">
      <timestamp>${new Date().toISOString()}</timestamp>
      <name>Test Item ${itemCount}</name>
      <description>This is test item number ${itemCount} with some sample data to increase file size. `.repeat(5) + `</description>
      <metadata>
        <category>Category ${itemCount % 100}</category>
        <tags>
          <tag>tag${itemCount % 10}</tag>
          <tag>tag${itemCount % 20}</tag>
          <tag>tag${itemCount % 30}</tag>
        </tags>
        <score>${(Math.random() * 100).toFixed(2)}</score>
        <active>${itemCount % 2 === 0}</active>
        <nested>
          <level1>
            <level2>
              <level3>
                <data>Deep nested data for item ${itemCount}</data>
                <value>${Math.floor(Math.random() * 1000)}</value>
              </level3>
            </level2>
          </level1>
        </nested>
      </metadata>
      <properties>
        <property name="prop1" value="${Math.random().toFixed(4)}" />
        <property name="prop2" value="${Math.random().toFixed(4)}" />
        <property name="prop3" value="${Math.random().toFixed(4)}" />
      </properties>
      <content>
        <paragraph>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</paragraph>
        <paragraph>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</paragraph>
      </content>
    </item>
`;

  stream.write(item);
  currentSize += Buffer.byteLength(item, 'utf8');
  itemCount++;

  // Progress update every 500 items
  if (itemCount % 500 === 0) {
    console.log(`  Generated ${itemCount.toLocaleString()} items, ${(currentSize / 1024 / 1024).toFixed(2)}MB`);
  }
}

stream.write('  </items>\n');
stream.write('</testData>\n');
stream.end();

stream.on('finish', () => {
  const stats = fs.statSync(outputPath);
  console.log('\n✓ Test XML file generated successfully!');
  console.log(`  Items: ${itemCount.toLocaleString()}`);
  console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  Path: ${outputPath}`);
  console.log('\nYou can now open this file in the app to test WASM loading with XML.');
});

stream.on('error', (error) => {
  console.error('✗ Error generating XML file:', error);
  process.exit(1);
});
