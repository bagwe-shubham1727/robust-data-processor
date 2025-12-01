
"""
Chaos Script for Backend Data Processor Testing
Fires 2000 requests per minute (mixed JSON and TXT) to test the ingestion API.
"""

import asyncio
import aiohttp
import random
import string
import time
import argparse
from datetime import datetime
from dataclasses import dataclass
from typing import Literal
import json
import ssl

# Configuration
TENANTS = ["acme_corp", "beta_inc", "gamma_llc", "delta_io", "epsilon_tech"]
REQUEST_RATE = 2000  # requests per minute
DURATION_SECONDS = 60  # default test duration

# Sample log messages for realistic testing
SAMPLE_LOGS = [
    "User 555-0199 accessed the dashboard at 10:30 AM",
    "ERROR: Connection timeout after 30s - retrying...",
    "Payment processed successfully for order #12345",
    "WARNING: Memory usage at 85% - consider scaling",
    "New user registration: john.doe@example.com",
    "API rate limit exceeded for client IP 192.168.1.100",
    "Database query took 2.5s - optimization needed",
    "Session expired for user_id: abc123xyz",
    "File upload completed: report_2024.pdf (2.5MB)",
    "Authentication failed: invalid credentials",
    "Cache miss for key: user_profile_42",
    "Webhook delivered successfully to endpoint /callback",
    "Scheduled task completed: daily_backup",
    "SSL certificate renewal reminder: expires in 30 days",
    "Load balancer health check passed",
]


@dataclass
class RequestResult:
    success: bool
    status_code: int
    response_time: float
    request_type: Literal["json", "txt"]
    tenant_id: str
    error: str = ""


def generate_random_text(min_len: int = 50, max_len: int = 200) -> str:
    """Generate random log-like text."""
    base = random.choice(SAMPLE_LOGS)
    extra_len = random.randint(min_len, max_len) - len(base)
    if extra_len > 0:
        extra = " " + "".join(random.choices(string.ascii_letters + string.digits + " ", k=extra_len))
        return base + extra
    return base


def generate_log_id() -> str:
    """Generate a unique log ID."""
    return f"log_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"


async def send_json_request(
    session: aiohttp.ClientSession, 
    url: str, 
    tenant_id: str
) -> RequestResult:
    """Send a JSON payload request."""
    log_id = generate_log_id()
    text = generate_random_text()
    
    payload = {
        "tenant_id": tenant_id,
        "log_id": log_id,
        "text": text
    }
    
    headers = {"Content-Type": "application/json"}
    
    start_time = time.time()
    try:
        async with session.post(url, json=payload, headers=headers, timeout=10) as response:
            response_time = time.time() - start_time
            return RequestResult(
                success=response.status in [200, 201, 202],
                status_code=response.status,
                response_time=response_time,
                request_type="json",
                tenant_id=tenant_id
            )
    except asyncio.TimeoutError:
        return RequestResult(
            success=False,
            status_code=0,
            response_time=time.time() - start_time,
            request_type="json",
            tenant_id=tenant_id,
            error="Timeout"
        )
    except Exception as e:
        return RequestResult(
            success=False,
            status_code=0,
            response_time=time.time() - start_time,
            request_type="json",
            tenant_id=tenant_id,
            error=str(e)
        )


async def send_txt_request(
    session: aiohttp.ClientSession, 
    url: str, 
    tenant_id: str
) -> RequestResult:
    """Send a raw text payload request."""
    text = generate_random_text()
    
    headers = {
        "Content-Type": "text/plain",
        "X-Tenant-ID": tenant_id
    }
    
    start_time = time.time()
    try:
        async with session.post(url, data=text, headers=headers, timeout=10) as response:
            response_time = time.time() - start_time
            return RequestResult(
                success=response.status in [200, 201, 202],
                status_code=response.status,
                response_time=response_time,
                request_type="txt",
                tenant_id=tenant_id
            )
    except asyncio.TimeoutError:
        return RequestResult(
            success=False,
            status_code=0,
            response_time=time.time() - start_time,
            request_type="txt",
            tenant_id=tenant_id,
            error="Timeout"
        )
    except Exception as e:
        return RequestResult(
            success=False,
            status_code=0,
            response_time=time.time() - start_time,
            request_type="txt",
            tenant_id=tenant_id,
            error=str(e)
        )


async def fire_request(
    session: aiohttp.ClientSession, 
    url: str, 
    semaphore: asyncio.Semaphore
) -> RequestResult:
    """Fire a single request (randomly JSON or TXT)."""
    async with semaphore:
        tenant_id = random.choice(TENANTS)
        
        # 50/50 split between JSON and TXT
        if random.random() < 0.5:
            return await send_json_request(session, url, tenant_id)
        else:
            return await send_txt_request(session, url, tenant_id)


async def run_chaos_test(
    url: str, 
    rpm: int = REQUEST_RATE, 
    duration: int = DURATION_SECONDS,
    max_concurrent: int = 100,
    skip_ssl: bool = False
):
    """Run the chaos test."""
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║                    CHAOS SCRIPT v1.0                        ║
║           Backend Data Processor Load Tester                 ║
╠══════════════════════════════════════════════════════════════╣
║  Target URL:     {url:<42} ║
║  Request Rate:   {rpm} RPM                                   ║
║  Duration:       {duration} seconds                               ║
║  Max Concurrent: {max_concurrent}                                     ║
║  Tenants:        {', '.join(TENANTS[:3])}...            ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    # Calculate timing
    total_requests = int(rpm * duration / 60)
    interval = 60 / rpm  # seconds between requests
    
    print(f"📊 Planning to send {total_requests} total requests")
    print(f"⏱️  Interval between requests: {interval*1000:.2f}ms")
    print(f"🚀 Starting chaos test at {datetime.now().isoformat()}\n")
    
    semaphore = asyncio.Semaphore(max_concurrent)
    results: list[RequestResult] = []
    
    # SSL configuration
    if skip_ssl:
        ssl_context = False  # Disable SSL verification entirely
    else:
        ssl_context = None  # Use system default SSL
    
    connector = aiohttp.TCPConnector(limit=max_concurrent, limit_per_host=max_concurrent, ssl=ssl_context)
    timeout = aiohttp.ClientTimeout(total=30)
    
    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        tasks = []
        start_time = time.time()
        
        for i in range(total_requests):
            # Schedule the request
            task = asyncio.create_task(fire_request(session, url, semaphore))
            tasks.append(task)
            
            # Progress update every 100 requests
            if (i + 1) % 100 == 0:
                elapsed = time.time() - start_time
                current_rpm = (i + 1) / elapsed * 60 if elapsed > 0 else 0
                print(f"📤 Sent {i + 1}/{total_requests} requests | Elapsed: {elapsed:.1f}s | Current RPM: {current_rpm:.0f}")
            
            # Rate limiting
            await asyncio.sleep(interval)
        
        print(f"\n⏳ Waiting for all responses...")
        results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Process results
    valid_results = [r for r in results if isinstance(r, RequestResult)]
    
    # Calculate statistics
    total_time = time.time() - start_time
    successful = sum(1 for r in valid_results if r.success)
    failed = len(valid_results) - successful
    
    json_requests = [r for r in valid_results if r.request_type == "json"]
    txt_requests = [r for r in valid_results if r.request_type == "txt"]
    
    response_times = [r.response_time for r in valid_results if r.success]
    avg_response_time = sum(response_times) / len(response_times) if response_times else 0
    min_response_time = min(response_times) if response_times else 0
    max_response_time = max(response_times) if response_times else 0
    
    # P50, P95, P99 latencies
    sorted_times = sorted(response_times)
    p50 = sorted_times[int(len(sorted_times) * 0.50)] if sorted_times else 0
    p95 = sorted_times[int(len(sorted_times) * 0.95)] if sorted_times else 0
    p99 = sorted_times[int(len(sorted_times) * 0.99)] if sorted_times else 0
    
    # Status code distribution
    status_codes = {}
    for r in valid_results:
        code = r.status_code if r.status_code else "Error"
        status_codes[code] = status_codes.get(code, 0) + 1
    
    # Tenant distribution
    tenant_counts = {}
    for r in valid_results:
        tenant_counts[r.tenant_id] = tenant_counts.get(r.tenant_id, 0) + 1
    
    # Error analysis
    errors = {}
    for r in valid_results:
        if r.error:
            errors[r.error] = errors.get(r.error, 0) + 1
    
    # Print results
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║                      TEST RESULTS                            ║
╠══════════════════════════════════════════════════════════════╣
║  Total Requests:     {len(valid_results):>6}                                ║
║  Successful:         {successful:>6} ({successful/len(valid_results)*100:.1f}%)                         ║
║  Failed:             {failed:>6} ({failed/len(valid_results)*100:.1f}%)                          ║
║  Total Time:         {total_time:>6.1f}s                               ║
║  Actual RPM:         {len(valid_results)/total_time*60:>6.0f}                                ║
╠══════════════════════════════════════════════════════════════╣
║  LATENCY STATS                                               ║
║  ─────────────                                               ║
║  Average:            {avg_response_time*1000:>6.1f}ms                              ║
║  Min:                {min_response_time*1000:>6.1f}ms                              ║
║  Max:                {max_response_time*1000:>6.1f}ms                              ║
║  P50:                {p50*1000:>6.1f}ms                              ║
║  P95:                {p95*1000:>6.1f}ms                              ║
║  P99:                {p99*1000:>6.1f}ms                              ║
╠══════════════════════════════════════════════════════════════╣
║  REQUEST TYPE BREAKDOWN                                      ║
║  ──────────────────────                                      ║
║  JSON Requests:      {len(json_requests):>6} ({len(json_requests)/len(valid_results)*100:.1f}%)                         ║
║  TXT Requests:       {len(txt_requests):>6} ({len(txt_requests)/len(valid_results)*100:.1f}%)                         ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    print("📊 Status Code Distribution:")
    for code, count in sorted(status_codes.items(), key=lambda x: str(x[0])):
        bar = "█" * int(count / len(valid_results) * 40)
        print(f"   {code}: {count:>5} {bar}")
    
    print("\n🏢 Tenant Distribution:")
    for tenant, count in sorted(tenant_counts.items()):
        bar = "█" * int(count / len(valid_results) * 40)
        print(f"   {tenant}: {count:>5} {bar}")
    
    if errors:
        print("\n⚠️  Errors:")
        for error, count in sorted(errors.items(), key=lambda x: -x[1]):
            print(f"   {error}: {count}")
    
    # Determine pass/fail
    success_rate = successful / len(valid_results) * 100 if valid_results else 0
    
    print("\n" + "="*64)
    if success_rate >= 95 and avg_response_time < 1.0:
        print("✅ TEST PASSED - API handled the load successfully!")
    elif success_rate >= 80:
        print("⚠️  TEST PARTIALLY PASSED - Some requests failed")
    else:
        print("❌ TEST FAILED - API could not handle the load")
    print("="*64)
    
    return {
        "total_requests": len(valid_results),
        "successful": successful,
        "failed": failed,
        "success_rate": success_rate,
        "avg_response_time": avg_response_time,
        "p95_latency": p95,
        "p99_latency": p99,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Chaos Script - Backend Load Tester",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python chaos_test.py https://your-api.com/ingest
  python chaos_test.py https://your-api.com/ingest --rpm 2000 --duration 60
  python chaos_test.py https://your-api.com/ingest --rpm 1000 --duration 120 --concurrent 200
        """
    )
    
    parser.add_argument("url", help="The API endpoint URL (e.g., https://your-api.com/ingest)")
    parser.add_argument("--rpm", type=int, default=2000, help="Requests per minute (default: 2000)")
    parser.add_argument("--duration", type=int, default=60, help="Test duration in seconds (default: 60)")
    parser.add_argument("--concurrent", type=int, default=100, help="Max concurrent requests (default: 100)")
    parser.add_argument("--skip-ssl", action="store_true", help="Skip SSL certificate verification (for testing)")
    
    args = parser.parse_args()
    
    # Run the test
    asyncio.run(run_chaos_test(
        url=args.url,
        rpm=args.rpm,
        duration=args.duration,
        max_concurrent=args.concurrent,
        skip_ssl=args.skip_ssl
    ))


if __name__ == "__main__":
    main()