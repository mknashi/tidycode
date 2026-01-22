// Generate a large log file for WASM testing (18MB)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputPath = path.join(__dirname, 'test-large-file.log');
const targetSize = 18 * 1024 * 1024; // 18MB

console.log('Generating large test log file (18MB)...');
console.log('Output:', outputPath);

// Generate a realistic log file with test data
const stream = fs.createWriteStream(outputPath);

const logLevels = ['INFO', 'DEBUG', 'WARN', 'ERROR', 'TRACE'];
const components = ['WebServer', 'Database', 'AuthService', 'APIGateway', 'CacheLayer', 'MessageQueue', 'FileSystem', 'Scheduler', 'Analytics', 'NotificationService'];
const users = ['user123', 'admin456', 'service_account', 'guest789', 'api_client', 'background_worker'];
const endpoints = ['/api/users', '/api/products', '/api/orders', '/api/auth/login', '/api/auth/logout', '/api/search', '/api/upload', '/api/download'];
const statusCodes = [200, 201, 204, 301, 302, 400, 401, 403, 404, 500, 502, 503];

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomIP() {
  return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

function generateLogEntry(lineNum) {
  const timestamp = new Date(Date.now() - Math.random() * 86400000 * 7).toISOString();
  const level = randomElement(logLevels);
  const component = randomElement(components);
  const ip = randomIP();
  const user = randomElement(users);
  const endpoint = randomElement(endpoints);
  const statusCode = randomElement(statusCodes);
  const responseTime = Math.floor(Math.random() * 5000);
  const requestId = Math.random().toString(36).substring(2, 15);

  let logMessage;

  // Generate different types of log entries
  const logType = Math.floor(Math.random() * 10);

  if (logType === 0) {
    // Error log with stack trace
    logMessage = `${timestamp} [${level}] [${component}] RequestID=${requestId} IP=${ip} User=${user} - Database connection failed: Connection timeout after ${responseTime}ms
    at DatabasePool.connect (db/pool.js:145:12)
    at Query.execute (db/query.js:89:23)
    at UserService.findById (services/user.js:34:18)
    at AuthMiddleware.verify (middleware/auth.js:67:29)
    Caused by: SocketTimeoutException: Read timed out`;
  } else if (logType === 1) {
    // HTTP request log
    logMessage = `${timestamp} [${level}] [${component}] RequestID=${requestId} IP=${ip} User=${user} - ${endpoint} - Status: ${statusCode} - ${responseTime}ms - UserAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`;
  } else if (logType === 2) {
    // Performance warning
    logMessage = `${timestamp} [${level}] [${component}] RequestID=${requestId} - Slow query detected: SELECT * FROM users WHERE created_at > '2024-01-01' - Execution time: ${responseTime}ms - Rows scanned: ${Math.floor(Math.random() * 1000000)}`;
  } else if (logType === 3) {
    // Security event
    logMessage = `${timestamp} [${level}] [${component}] RequestID=${requestId} IP=${ip} User=${user} - Authentication attempt ${statusCode === 401 ? 'FAILED' : 'SUCCESSFUL'} - Failed attempts: ${Math.floor(Math.random() * 5)}`;
  } else if (logType === 4) {
    // Cache operation
    logMessage = `${timestamp} [${level}] [${component}] RequestID=${requestId} - Cache ${Math.random() > 0.5 ? 'HIT' : 'MISS'} for key: cache:user:${user}:session - TTL: ${Math.floor(Math.random() * 3600)}s`;
  } else if (logType === 5) {
    // Message queue
    logMessage = `${timestamp} [${level}] [${component}] RequestID=${requestId} - Message published to queue: notifications - MessageID: ${requestId} - Size: ${Math.floor(Math.random() * 10000)} bytes - Priority: ${Math.floor(Math.random() * 5)}`;
  } else if (logType === 6) {
    // File operation
    logMessage = `${timestamp} [${level}] [${component}] RequestID=${requestId} User=${user} - File operation: ${Math.random() > 0.5 ? 'UPLOAD' : 'DOWNLOAD'} - Path: /uploads/documents/${requestId}.pdf - Size: ${(Math.random() * 100).toFixed(2)}MB - Duration: ${responseTime}ms`;
  } else if (logType === 7) {
    // Background job
    logMessage = `${timestamp} [${level}] [${component}] RequestID=${requestId} - Background job started: cleanup_old_sessions - Jobs in queue: ${Math.floor(Math.random() * 50)} - Workers available: ${Math.floor(Math.random() * 10)}`;
  } else if (logType === 8) {
    // Memory/Resource monitoring
    logMessage = `${timestamp} [${level}] [${component}] RequestID=${requestId} - Resource usage: CPU: ${(Math.random() * 100).toFixed(1)}% - Memory: ${(Math.random() * 16).toFixed(2)}GB / 16GB - Heap: ${(Math.random() * 4).toFixed(2)}GB - Connections: ${Math.floor(Math.random() * 500)}`;
  } else {
    // Generic application log
    logMessage = `${timestamp} [${level}] [${component}] RequestID=${requestId} IP=${ip} - Processing request for ${user} - Action: ${randomElement(['CREATE', 'READ', 'UPDATE', 'DELETE'])} - Entity: ${randomElement(['User', 'Product', 'Order', 'Session', 'Document'])} - Duration: ${responseTime}ms`;
  }

  return logMessage + '\n';
}

let currentSize = 0;
let lineCount = 0;

while (currentSize < targetSize) {
  const logEntry = generateLogEntry(lineCount);
  stream.write(logEntry);
  currentSize += Buffer.byteLength(logEntry, 'utf8');
  lineCount++;

  // Progress update every 5000 lines
  if (lineCount % 5000 === 0) {
    console.log(`  Generated ${lineCount.toLocaleString()} lines, ${(currentSize / 1024 / 1024).toFixed(2)}MB`);
  }
}

stream.end();

stream.on('finish', () => {
  const stats = fs.statSync(outputPath);
  console.log('\n✓ Test log file generated successfully!');
  console.log(`  Lines: ${lineCount.toLocaleString()}`);
  console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  Path: ${outputPath}`);
  console.log('\nYou can now open this file in the app to test WASM loading with log files.');
});

stream.on('error', (error) => {
  console.error('✗ Error generating log file:', error);
  process.exit(1);
});
