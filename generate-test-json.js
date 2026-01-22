import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate a large JSON file for testing WASM large file support
 * Target size: ~30 MB
 */

console.log('Generating 30 MB test JSON file...');

const targetSizeBytes = 30 * 1024 * 1024; // 30 MB
let currentSize = 0;
let recordCount = 0;

// Start the JSON array
let jsonContent = '{\n  "metadata": {\n    "generator": "Tidy Code Test Data Generator",\n    "purpose": "Testing WASM large file support",\n    "targetSize": "30 MB",\n    "generated": "' + new Date().toISOString() + '"\n  },\n  "data": [\n';

currentSize = Buffer.byteLength(jsonContent, 'utf8');

// Generate records until we reach target size
while (currentSize < targetSizeBytes - 5000) { // Leave room for closing brackets
  const record = {
    id: recordCount + 1,
    uuid: `${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`,
    timestamp: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    user: {
      username: `user_${recordCount}`,
      email: `user${recordCount}@example.com`,
      firstName: `First${recordCount}`,
      lastName: `Last${recordCount}`,
      role: ['admin', 'user', 'moderator', 'viewer'][recordCount % 4],
      active: recordCount % 3 !== 0,
      preferences: {
        theme: ['dark', 'light'][recordCount % 2],
        language: ['en', 'es', 'fr', 'de', 'ja'][recordCount % 5],
        notifications: recordCount % 2 === 0,
        timezone: 'UTC'
      }
    },
    data: {
      title: `Record Title ${recordCount}`,
      description: `This is a detailed description for record number ${recordCount}. It contains various information about the record including metadata, user information, and nested objects to simulate real-world data structures.`,
      category: ['Technology', 'Science', 'Business', 'Entertainment', 'Sports'][recordCount % 5],
      tags: [`tag${recordCount}`, `category${recordCount % 10}`, `type${recordCount % 5}`],
      metrics: {
        views: Math.floor(Math.random() * 100000),
        likes: Math.floor(Math.random() * 10000),
        shares: Math.floor(Math.random() * 1000),
        comments: Math.floor(Math.random() * 500),
        rating: (Math.random() * 5).toFixed(2)
      },
      content: {
        text: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Record ${recordCount} contains important information that needs to be preserved and indexed efficiently.`,
        metadata: {
          wordCount: 234 + recordCount,
          readTime: Math.floor(Math.random() * 10) + 1,
          difficulty: ['easy', 'medium', 'hard'][recordCount % 3],
          featured: recordCount % 7 === 0
        }
      },
      location: {
        country: ['USA', 'UK', 'Canada', 'Germany', 'Japan', 'Australia'][recordCount % 6],
        city: `City${recordCount % 100}`,
        coordinates: {
          latitude: (Math.random() * 180 - 90).toFixed(6),
          longitude: (Math.random() * 360 - 180).toFixed(6)
        }
      }
    },
    status: {
      published: recordCount % 2 === 0,
      verified: recordCount % 3 === 0,
      featured: recordCount % 5 === 0,
      archived: recordCount % 10 === 0
    },
    audit: {
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: `admin_${recordCount % 10}`,
      version: Math.floor(Math.random() * 20) + 1
    }
  };

  const recordJson = JSON.stringify(record, null, 2)
    .split('\n')
    .map(line => '    ' + line)
    .join('\n');

  const separator = recordCount > 0 ? ',\n' : '';
  const chunk = separator + recordJson;

  currentSize += Buffer.byteLength(chunk, 'utf8');
  jsonContent += chunk;
  recordCount++;

  // Progress indicator every 1000 records
  if (recordCount % 1000 === 0) {
    const sizeMB = (currentSize / (1024 * 1024)).toFixed(2);
    console.log(`Generated ${recordCount} records (${sizeMB} MB)...`);
  }
}

// Close the JSON structure
jsonContent += '\n  ]\n}\n';
currentSize = Buffer.byteLength(jsonContent, 'utf8');

// Write to file
const outputPath = path.join(__dirname, 'test-data-30mb.json');
fs.writeFileSync(outputPath, jsonContent, 'utf8');

const finalSizeMB = (currentSize / (1024 * 1024)).toFixed(2);
console.log('\n✅ Test file generated successfully!');
console.log(`   File: ${outputPath}`);
console.log(`   Size: ${finalSizeMB} MB`);
console.log(`   Records: ${recordCount.toLocaleString()}`);
console.log(`   Lines: ${jsonContent.split('\n').length.toLocaleString()}`);
console.log('\nYou can now open this file in Tidy Code to test WASM large file support.');
