# Chaos Script - Backend Load Tester

A comprehensive load testing toolkit for testing your Backend Data Processor API with 2000+ requests per minute of mixed JSON and TXT payloads.

## 📦 Included Scripts

| Script | Language | Best For |
|--------|----------|----------|
| `chaos_test.py` | Python 3 | Production testing, detailed stats |
| `chaos_test.js` | Node.js | Quick testing, no pip install needed |
| `chaos_test.sh` | Bash | Simple testing, minimal dependencies |

## 🚀 Quick Start

### Python Version (Recommended)

```bash
# Install dependencies
pip install aiohttp

# Run the test
python chaos_test.py https://your-api.com/ingest

# With custom settings
python chaos_test.py https://your-api.com/ingest --rpm 2000 --duration 60 --concurrent 100
```

### Node.js Version

```bash
# No dependencies needed!
node chaos_test.js https://your-api.com/ingest

# With custom settings
node chaos_test.js https://your-api.com/ingest 2000 60
```


## 📊 What It Tests

### Request Types (50/50 Mix)

**JSON Requests:**

```bash
curl -X POST https://your-api.com/ingest \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "acme_corp", "log_id": "log_123", "text": "User accessed..."}'
```

**TXT Requests:**

```bash
curl -X POST https://your-api.com/ingest \
  -H "Content-Type: text/plain" \
  -H "X-Tenant-ID: acme_corp" \
  -d "User accessed the dashboard at 10:30 AM"
```

### Multi-Tenancy

Requests are distributed across these tenants:

- `acme_corp`
- `beta_inc`
- `gamma_llc`
- `delta_io`
- `epsilon_tech`

## 📈 Output Metrics

The scripts provide detailed statistics:

- **Success/Failure counts**
- **Response time percentiles** (P50, P95, P99)
- **Status code distribution**
- **Tenant distribution**
- **Error breakdown**
- **Actual RPM achieved**

## ✅ Pass/Fail Criteria

| Condition | Result |
|-----------|--------|
| ≥95% success rate + avg latency <1s | ✅ PASS |
| 80-94% success rate | ⚠️ PARTIAL |
| <80% success rate | ❌ FAIL |

## 🔧 Configuration Options

### Python Script

| Flag | Default | Description |
|------|---------|-------------|
| `--rpm` | 2000 | Requests per minute |
| `--duration` | 60 | Test duration in seconds |
| `--concurrent` | 100 | Max concurrent connections |

### Node.js Script

```
node chaos_test.js <URL> [RPM] [DURATION]
```


## 📝 Sample Output

```
╔══════════════════════════════════════════════════════════════╗
║                      TEST RESULTS                            ║
╠══════════════════════════════════════════════════════════════╣
║  Total Requests:      2000                                   ║
║  Successful:          1950 (97.5%)                           ║
║  Failed:                50                                   ║
║  Total Time:          60.2s                                  ║
║  Actual RPM:          1993                                   ║
╠══════════════════════════════════════════════════════════════╣
║  LATENCY STATS                                               ║
║  Average:             45.2ms                                 ║
║  P50:                 38.0ms                                 ║
║  P95:                 89.0ms                                 ║
║  P99:                145.0ms                                 ║
╚══════════════════════════════════════════════════════════════╝

📊 Status Code Distribution:
   202:  1950 ████████████████████████████████████████
   500:    50 █

🏢 Tenant Distribution:
   acme_corp:   410 ████████
   beta_inc:    395 ████████
   delta_io:    405 ████████
   epsilon_tech: 398 ████████
   gamma_llc:   392 ████████

✅ TEST PASSED - API handled the load successfully!
```

## 🛠️ Troubleshooting

### "Connection refused" errors

- Check that your API URL is correct
- Ensure the API is deployed and running

### Low actual RPM

- Increase `--concurrent` for Python script
- Check your network connection
- The API might be rate-limiting responses

### High failure rate

- Check API logs for errors
- Verify the API can handle the load
- Consider scaling up your serverless functions

## 📋 Requirements

### Python

- Python 3.8+
- aiohttp (`pip install aiohttp`)

### Node.js

- Node.js 14+
- No additional packages needed

## 🎯 Expected API Behavior

Your API should:

1. Return `202 Accepted` immediately (non-blocking)
2. Handle both JSON and text/plain content types
3. Extract tenant ID from JSON body or X-Tenant-ID header
4. Queue messages for async processing
