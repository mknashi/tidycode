#!/usr/bin/env node
/**
 * Generate test files of various sizes and formats for testing VirtualEditor and WASM support
 *
 * Usage:
 *   node scripts/generate-test-files.js [options]
 *
 * Options:
 *   --all           Generate all test files (default if no options)
 *   --json          Generate JSON test files
 *   --xml           Generate XML test files
 *   --csv           Generate CSV test files
 *   --log           Generate LOG test files
 *   --size=<mb>     Generate single file of specific size (e.g., --size=50 --json)
 *   --output=<dir>  Output directory (default: ./test-files)
 *
 * Test file sizes generated (to test different code paths):
 *   - 5MB   : Below WASM threshold (uses regular loading)
 *   - 15MB  : Above WASM threshold, below safe load limit (full CodeMirror)
 *   - 25MB  : Above safe load limit (VirtualEditor on web/desktop)
 *   - 60MB  : Above web WASM limit (preview on web, full on desktop)
 *   - 120MB : Above desktop WASM limit (preview on both)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  all: args.length === 0 || args.includes('--all'),
  json: args.includes('--json'),
  xml: args.includes('--xml'),
  csv: args.includes('--csv'),
  log: args.includes('--log'),
  size: args.find(a => a.startsWith('--size='))?.split('=')[1],
  output: args.find(a => a.startsWith('--output='))?.split('=')[1] || path.join(rootDir, 'test-files')
};

// If specific formats are requested, don't use --all
if (options.json || options.xml || options.csv || options.log) {
  options.all = false;
}

// Test sizes in MB
const TEST_SIZES = [5, 15, 25, 60, 120];

// Ensure output directory exists
if (!fs.existsSync(options.output)) {
  fs.mkdirSync(options.output, { recursive: true });
  console.log(`Created output directory: ${options.output}`);
}

// ============================================
// JSON Generator
// ============================================
function generateJSON(targetSizeMB, outputPath) {
  console.log(`\nGenerating ${targetSizeMB}MB JSON file...`);
  const targetSize = targetSizeMB * 1024 * 1024;
  let currentSize = 0;
  let recordCount = 0;

  const stream = fs.createWriteStream(outputPath);

  // Write header
  const header = `{
  "metadata": {
    "generator": "TidyCode Test Generator",
    "targetSize": "${targetSizeMB}MB",
    "generated": "${new Date().toISOString()}",
    "purpose": "Testing VirtualEditor and WASM large file support"
  },
  "data": [
`;
  stream.write(header);
  currentSize = Buffer.byteLength(header, 'utf8');

  return new Promise((resolve, reject) => {
    function writeRecords() {
      while (currentSize < targetSize - 5000) {
        const record = {
          id: recordCount + 1,
          uuid: `${Math.random().toString(36).substring(2, 15)}-${Date.now()}`,
          timestamp: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
          user: {
            username: `user_${recordCount}`,
            email: `user${recordCount}@example.com`,
            role: ['admin', 'user', 'moderator', 'viewer'][recordCount % 4]
          },
          data: {
            title: `Record ${recordCount}`,
            description: `Description for record ${recordCount}. `.repeat(10),
            category: ['Tech', 'Science', 'Business', 'Sports'][recordCount % 4],
            tags: [`tag${recordCount % 100}`, `cat${recordCount % 50}`],
            metrics: {
              views: Math.floor(Math.random() * 100000),
              likes: Math.floor(Math.random() * 10000),
              score: (Math.random() * 5).toFixed(2)
            }
          },
          status: recordCount % 2 === 0
        };

        const recordJson = JSON.stringify(record, null, 2)
          .split('\n').map(line => '    ' + line).join('\n');
        const chunk = (recordCount > 0 ? ',\n' : '') + recordJson;

        if (!stream.write(chunk)) {
          stream.once('drain', writeRecords);
          return;
        }

        currentSize += Buffer.byteLength(chunk, 'utf8');
        recordCount++;

        if (recordCount % 5000 === 0) {
          console.log(`  ${recordCount.toLocaleString()} records (${(currentSize / 1024 / 1024).toFixed(1)}MB)`);
        }
      }

      // Close JSON structure
      stream.write('\n  ]\n}\n');
      stream.end();
    }

    stream.on('finish', () => {
      const stats = fs.statSync(outputPath);
      console.log(`  ✓ ${path.basename(outputPath)}: ${(stats.size / 1024 / 1024).toFixed(2)}MB, ${recordCount.toLocaleString()} records`);
      resolve();
    });

    stream.on('error', reject);
    writeRecords();
  });
}

// ============================================
// XML Generator
// ============================================
function generateXML(targetSizeMB, outputPath) {
  console.log(`\nGenerating ${targetSizeMB}MB XML file...`);
  const targetSize = targetSizeMB * 1024 * 1024;
  let currentSize = 0;
  let itemCount = 0;

  const stream = fs.createWriteStream(outputPath);

  const header = `<?xml version="1.0" encoding="UTF-8"?>
<testData>
  <metadata>
    <generator>TidyCode Test Generator</generator>
    <targetSize>${targetSizeMB}MB</targetSize>
    <generated>${new Date().toISOString()}</generated>
  </metadata>
  <items>
`;
  stream.write(header);
  currentSize = Buffer.byteLength(header, 'utf8');

  return new Promise((resolve, reject) => {
    function writeItems() {
      while (currentSize < targetSize - 1000) {
        const item = `    <item id="${itemCount}">
      <timestamp>${new Date().toISOString()}</timestamp>
      <name>Item ${itemCount}</name>
      <description>${'Sample data for testing. '.repeat(20)}</description>
      <category>Category ${itemCount % 100}</category>
      <tags>
        <tag>tag${itemCount % 10}</tag>
        <tag>tag${itemCount % 20}</tag>
      </tags>
      <score>${(Math.random() * 100).toFixed(2)}</score>
      <active>${itemCount % 2 === 0}</active>
      <nested>
        <level1><level2><data>Nested data ${itemCount}</data></level2></level1>
      </nested>
    </item>
`;

        if (!stream.write(item)) {
          stream.once('drain', writeItems);
          return;
        }

        currentSize += Buffer.byteLength(item, 'utf8');
        itemCount++;

        if (itemCount % 5000 === 0) {
          console.log(`  ${itemCount.toLocaleString()} items (${(currentSize / 1024 / 1024).toFixed(1)}MB)`);
        }
      }

      stream.write('  </items>\n</testData>\n');
      stream.end();
    }

    stream.on('finish', () => {
      const stats = fs.statSync(outputPath);
      console.log(`  ✓ ${path.basename(outputPath)}: ${(stats.size / 1024 / 1024).toFixed(2)}MB, ${itemCount.toLocaleString()} items`);
      resolve();
    });

    stream.on('error', reject);
    writeItems();
  });
}

// ============================================
// CSV Generator
// ============================================
function generateCSV(targetSizeMB, outputPath) {
  console.log(`\nGenerating ${targetSizeMB}MB CSV file...`);
  const targetSize = targetSizeMB * 1024 * 1024;
  let currentSize = 0;
  let rowCount = 0;

  const stream = fs.createWriteStream(outputPath);

  const header = 'id,timestamp,user_id,username,email,category,product_name,quantity,price,total,status,country,city,notes\n';
  stream.write(header);
  currentSize = Buffer.byteLength(header, 'utf8');

  const categories = ['Electronics', 'Clothing', 'Food', 'Books', 'Home', 'Sports', 'Toys', 'Health'];
  const statuses = ['pending', 'completed', 'cancelled', 'refunded', 'processing'];
  const countries = ['USA', 'UK', 'Canada', 'Germany', 'France', 'Japan', 'Australia', 'Brazil'];

  return new Promise((resolve, reject) => {
    function writeRows() {
      while (currentSize < targetSize) {
        const price = (Math.random() * 1000).toFixed(2);
        const quantity = Math.floor(Math.random() * 100) + 1;
        const total = (price * quantity).toFixed(2);
        const row = `${rowCount},${new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()},${rowCount % 10000},user_${rowCount},user${rowCount}@example.com,${categories[rowCount % categories.length]},Product ${rowCount % 1000},${quantity},${price},${total},${statuses[rowCount % statuses.length]},${countries[rowCount % countries.length]},City${rowCount % 500},"Notes for order ${rowCount}. ${'Additional details. '.repeat(5)}"\n`;

        if (!stream.write(row)) {
          stream.once('drain', writeRows);
          return;
        }

        currentSize += Buffer.byteLength(row, 'utf8');
        rowCount++;

        if (rowCount % 50000 === 0) {
          console.log(`  ${rowCount.toLocaleString()} rows (${(currentSize / 1024 / 1024).toFixed(1)}MB)`);
        }
      }

      stream.end();
    }

    stream.on('finish', () => {
      const stats = fs.statSync(outputPath);
      console.log(`  ✓ ${path.basename(outputPath)}: ${(stats.size / 1024 / 1024).toFixed(2)}MB, ${rowCount.toLocaleString()} rows`);
      resolve();
    });

    stream.on('error', reject);
    writeRows();
  });
}

// ============================================
// LOG Generator
// ============================================
function generateLOG(targetSizeMB, outputPath) {
  console.log(`\nGenerating ${targetSizeMB}MB LOG file...`);
  const targetSize = targetSizeMB * 1024 * 1024;
  let currentSize = 0;
  let lineCount = 0;

  const stream = fs.createWriteStream(outputPath);

  const levels = ['INFO', 'DEBUG', 'WARN', 'ERROR', 'TRACE'];
  const components = ['WebServer', 'Database', 'AuthService', 'APIGateway', 'Cache', 'Queue', 'Scheduler'];
  const endpoints = ['/api/users', '/api/products', '/api/orders', '/api/auth', '/api/search'];
  const statusCodes = [200, 201, 301, 400, 401, 403, 404, 500, 502, 503];

  return new Promise((resolve, reject) => {
    function writeLines() {
      while (currentSize < targetSize) {
        const timestamp = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();
        const level = levels[Math.floor(Math.random() * levels.length)];
        const component = components[Math.floor(Math.random() * components.length)];
        const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
        const status = statusCodes[Math.floor(Math.random() * statusCodes.length)];
        const responseTime = Math.floor(Math.random() * 5000);
        const requestId = Math.random().toString(36).substring(2, 15);

        let line;
        const logType = lineCount % 10;

        if (logType === 0 && level === 'ERROR') {
          line = `${timestamp} [${level}] [${component}] ReqID=${requestId} IP=${ip} - Database connection failed after ${responseTime}ms\n    at Pool.connect (db/pool.js:145)\n    at Query.execute (db/query.js:89)\n`;
        } else if (logType < 5) {
          line = `${timestamp} [${level}] [${component}] ReqID=${requestId} IP=${ip} - ${endpoint} Status=${status} Duration=${responseTime}ms User=user_${lineCount % 1000}\n`;
        } else {
          line = `${timestamp} [${level}] [${component}] ReqID=${requestId} - ${'Processing request with detailed logging information. '.repeat(3)}Duration=${responseTime}ms\n`;
        }

        if (!stream.write(line)) {
          stream.once('drain', writeLines);
          return;
        }

        currentSize += Buffer.byteLength(line, 'utf8');
        lineCount++;

        if (lineCount % 50000 === 0) {
          console.log(`  ${lineCount.toLocaleString()} lines (${(currentSize / 1024 / 1024).toFixed(1)}MB)`);
        }
      }

      stream.end();
    }

    stream.on('finish', () => {
      const stats = fs.statSync(outputPath);
      console.log(`  ✓ ${path.basename(outputPath)}: ${(stats.size / 1024 / 1024).toFixed(2)}MB, ${lineCount.toLocaleString()} lines`);
      resolve();
    });

    stream.on('error', reject);
    writeLines();
  });
}

// ============================================
// Main execution
// ============================================
async function main() {
  console.log('='.repeat(60));
  console.log('TidyCode Test File Generator');
  console.log('='.repeat(60));
  console.log(`Output directory: ${options.output}`);

  const sizes = options.size ? [parseInt(options.size)] : TEST_SIZES;
  const formats = [];

  if (options.all || options.json) formats.push({ ext: 'json', fn: generateJSON });
  if (options.all || options.xml) formats.push({ ext: 'xml', fn: generateXML });
  if (options.all || options.csv) formats.push({ ext: 'csv', fn: generateCSV });
  if (options.all || options.log) formats.push({ ext: 'log', fn: generateLOG });

  if (formats.length === 0) {
    console.log('\nNo format specified. Use --json, --xml, --csv, --log, or --all');
    process.exit(1);
  }

  console.log(`\nGenerating files for sizes: ${sizes.map(s => s + 'MB').join(', ')}`);
  console.log(`Formats: ${formats.map(f => f.ext.toUpperCase()).join(', ')}`);

  for (const size of sizes) {
    for (const format of formats) {
      const filename = `test-${size}mb.${format.ext}`;
      const outputPath = path.join(options.output, filename);
      await format.fn(size, outputPath);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Generation complete!');
  console.log('='.repeat(60));

  // List generated files
  const files = fs.readdirSync(options.output)
    .filter(f => f.startsWith('test-'))
    .map(f => {
      const stats = fs.statSync(path.join(options.output, f));
      return { name: f, size: stats.size };
    })
    .sort((a, b) => a.size - b.size);

  console.log('\nGenerated files:');
  files.forEach(f => {
    console.log(`  ${f.name.padEnd(25)} ${(f.size / 1024 / 1024).toFixed(2).padStart(8)}MB`);
  });

  console.log(`\nTest scenarios:`);
  console.log(`  5MB   - Regular loading (below WASM threshold)`);
  console.log(`  15MB  - WASM + CodeMirror (syntax highlighting disabled)`);
  console.log(`  25MB  - VirtualEditor (full content)`);
  console.log(`  60MB  - Web: 50MB preview | Desktop: VirtualEditor full`);
  console.log(`  120MB - Web: 50MB preview | Desktop: 100MB preview`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
