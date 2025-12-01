
/**
 * Chaos Script - Node.js Version
 * Fires 2000 requests per minute of mixed JSON and TXT to test the API
 * 
 * Usage: node chaos_test.js <URL> [RPM] [DURATION]
 * Example: node chaos_test.js https://your-api.com/ingest 2000 60
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Configuration
const TENANTS = ['acme_corp', 'beta_inc', 'gamma_llc', 'delta_io', 'epsilon_tech'];
const DEFAULT_RPM = 2000;
const DEFAULT_DURATION = 60;

const SAMPLE_LOGS = [
    'User 555-0199 accessed the dashboard at 10:30 AM',
    'ERROR: Connection timeout after 30s - retrying...',
    'Payment processed successfully for order #12345',
    'WARNING: Memory usage at 85% - consider scaling',
    'New user registration: john.doe@example.com',
    'API rate limit exceeded for client IP 192.168.1.100',
    'Database query took 2.5s - optimization needed',
    'Session expired for user_id: abc123xyz',
    'File upload completed: report_2024.pdf (2.5MB)',
    'Authentication failed: invalid credentials',
    'Cache miss for key: user_profile_42',
    'Webhook delivered successfully to endpoint /callback',
    'Scheduled task completed: daily_backup',
    'SSL certificate renewal reminder: expires in 30 days',
    'Load balancer health check passed',
];

// Stats
const stats = {
    total: 0,
    success: 0,
    failed: 0,
    jsonCount: 0,
    txtCount: 0,
    responseTimes: [],
    statusCodes: {},
    tenantCounts: {},
    errors: {},
};

// Helper functions
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function generateLogId() {
    return `log_${Date.now()}_${randomInt(1000, 9999)}`;
}

function generateText() {
    const base = randomChoice(SAMPLE_LOGS);
    const extra = ` - timestamp: ${Date.now()} - id: ${randomInt(10000, 99999)}`;
    return base + extra;
}

function makeRequest(urlStr, options, body) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const parsedUrl = new URL(urlStr);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const reqOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname,
            method: 'POST',
            headers: options.headers,
            timeout: 10000,
        };

        const req = protocol.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve({
                    success: res.statusCode >= 200 && res.statusCode < 300,
                    statusCode: res.statusCode,
                    responseTime: Date.now() - startTime,
                    error: null,
                });
            });
        });

        req.on('error', (err) => {
            resolve({
                success: false,
                statusCode: 0,
                responseTime: Date.now() - startTime,
                error: err.message,
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                success: false,
                statusCode: 0,
                responseTime: Date.now() - startTime,
                error: 'Timeout',
            });
        });

        req.write(body);
        req.end();
    });
}

async function sendJsonRequest(url, tenant) {
    const payload = JSON.stringify({
        tenant_id: tenant,
        log_id: generateLogId(),
        text: generateText(),
    });

    return makeRequest(url, {
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
        },
    }, payload);
}

async function sendTxtRequest(url, tenant) {
    const text = generateText();

    return makeRequest(url, {
        headers: {
            'Content-Type': 'text/plain',
            'X-Tenant-ID': tenant,
            'Content-Length': Buffer.byteLength(text),
        },
    }, text);
}

function printBanner(url, rpm, duration) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                  CHAOS SCRIPT (Node.js)                      ║
║           Backend Data Processor Load Tester                  ║
╠══════════════════════════════════════════════════════════════╣
║  Target URL:     ${url.padEnd(42)}║
║  Request Rate:   ${rpm} RPM                                   ║
║  Duration:       ${duration} seconds                               ║
║  Tenants:        ${TENANTS.slice(0, 3).join(', ')}...            ║
╚══════════════════════════════════════════════════════════════╝
    `);
}

function printResults(totalTime) {
    const successRate = stats.total > 0 ? (stats.success / stats.total * 100).toFixed(1) : 0;
    const actualRpm = totalTime > 0 ? Math.round(stats.total / totalTime * 60) : 0;

    // Calculate latency percentiles
    const sorted = [...stats.responseTimes].sort((a, b) => a - b);
    const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const min = sorted.length > 0 ? sorted[0] : 0;
    const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
    const p50 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.50)] : 0;
    const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const p99 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : 0;

    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      TEST RESULTS                            ║
╠══════════════════════════════════════════════════════════════╣
║  Total Requests:     ${String(stats.total).padStart(6)}                                ║
║  Successful:         ${String(stats.success).padStart(6)} (${successRate}%)                         ║
║  Failed:             ${String(stats.failed).padStart(6)}                                 ║
║  Total Time:         ${String(totalTime.toFixed(1)).padStart(6)}s                               ║
║  Actual RPM:         ${String(actualRpm).padStart(6)}                                ║
╠══════════════════════════════════════════════════════════════╣
║  LATENCY STATS                                               ║
║  ─────────────                                               ║
║  Average:            ${String(avg.toFixed(1)).padStart(6)}ms                              ║
║  Min:                ${String(min.toFixed(1)).padStart(6)}ms                              ║
║  Max:                ${String(max.toFixed(1)).padStart(6)}ms                              ║
║  P50:                ${String(p50.toFixed(1)).padStart(6)}ms                              ║
║  P95:                ${String(p95.toFixed(1)).padStart(6)}ms                              ║
║  P99:                ${String(p99.toFixed(1)).padStart(6)}ms                              ║
╠══════════════════════════════════════════════════════════════╣
║  REQUEST TYPE BREAKDOWN                                      ║
║  ──────────────────────                                      ║
║  JSON Requests:      ${String(stats.jsonCount).padStart(6)}                                ║
║  TXT Requests:       ${String(stats.txtCount).padStart(6)}                                ║
╚══════════════════════════════════════════════════════════════╝
    `);

    // Status code distribution
    console.log('📊 Status Code Distribution:');
    Object.entries(stats.statusCodes)
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .forEach(([code, count]) => {
            const bar = '█'.repeat(Math.round(count / stats.total * 40));
            console.log(`   ${code}: ${String(count).padStart(5)} ${bar}`);
        });

    // Tenant distribution
    console.log('\n🏢 Tenant Distribution:');
    Object.entries(stats.tenantCounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([tenant, count]) => {
            const bar = '█'.repeat(Math.round(count / stats.total * 40));
            console.log(`   ${tenant}: ${String(count).padStart(5)} ${bar}`);
        });

    // Errors
    if (Object.keys(stats.errors).length > 0) {
        console.log('\n⚠️  Errors:');
        Object.entries(stats.errors)
            .sort(([, a], [, b]) => b - a)
            .forEach(([error, count]) => {
                console.log(`   ${error}: ${count}`);
            });
    }

    // Pass/Fail
    console.log('\n' + '='.repeat(64));
    if (successRate >= 95 && avg < 1000) {
        console.log('✅ TEST PASSED - API handled the load successfully!');
    } else if (successRate >= 80) {
        console.log('⚠️  TEST PARTIALLY PASSED - Some requests failed');
    } else {
        console.log('❌ TEST FAILED - API could not handle the load');
    }
    console.log('='.repeat(64));
}

async function runChaosTest(url, rpm, duration) {
    printBanner(url, rpm, duration);

    const totalRequests = Math.floor(rpm * duration / 60);
    const interval = 60000 / rpm; // ms between requests

    console.log(`📊 Planning to send ${totalRequests} total requests`);
    console.log(`⏱️  Interval between requests: ${interval.toFixed(2)}ms`);
    console.log(`🚀 Starting chaos test at ${new Date().toISOString()}\n`);

    const startTime = Date.now();
    const promises = [];

    for (let i = 0; i < totalRequests; i++) {
        const tenant = randomChoice(TENANTS);
        const isJson = Math.random() < 0.5;

        // Create request promise
        const requestPromise = (async () => {
            const result = isJson
                ? await sendJsonRequest(url, tenant)
                : await sendTxtRequest(url, tenant);

            // Update stats
            stats.total++;
            if (result.success) {
                stats.success++;
                stats.responseTimes.push(result.responseTime);
            } else {
                stats.failed++;
            }

            if (isJson) stats.jsonCount++;
            else stats.txtCount++;

            const statusKey = result.statusCode || 'Error';
            stats.statusCodes[statusKey] = (stats.statusCodes[statusKey] || 0) + 1;
            stats.tenantCounts[tenant] = (stats.tenantCounts[tenant] || 0) + 1;

            if (result.error) {
                stats.errors[result.error] = (stats.errors[result.error] || 0) + 1;
            }

            return result;
        })();

        promises.push(requestPromise);

        // Progress update every 100 requests
        if ((i + 1) % 100 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const currentRpm = elapsed > 0 ? Math.round((i + 1) / elapsed * 60) : 0;
            console.log(`📤 Sent ${i + 1}/${totalRequests} requests | Elapsed: ${elapsed.toFixed(1)}s | Current RPM: ${currentRpm}`);
        }

        // Rate limiting - wait before sending next request
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    console.log('\n⏳ Waiting for all responses...');
    await Promise.all(promises);

    const totalTime = (Date.now() - startTime) / 1000;
    printResults(totalTime);
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log(`
Usage: node chaos_test.js <URL> [RPM] [DURATION]

Arguments:
  URL       The API endpoint URL (required)
  RPM       Requests per minute (default: ${DEFAULT_RPM})
  DURATION  Test duration in seconds (default: ${DEFAULT_DURATION})

Examples:
  node chaos_test.js https://your-api.com/ingest
  node chaos_test.js https://your-api.com/ingest 2000 60
  node chaos_test.js http://localhost:8080/ingest 1000 30
    `);
    process.exit(1);
}

const url = args[0];
const rpm = parseInt(args[1]) || DEFAULT_RPM;
const duration = parseInt(args[2]) || DEFAULT_DURATION;

runChaosTest(url, rpm, duration).catch(console.error);
