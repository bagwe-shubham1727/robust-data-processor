# robust-data-processor

# Robust Data Processor (GCP)

A scalable, multi-tenant, event-driven API backend for ingesting and processing logs on Google Cloud Platform.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           INGESTION FLOW                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐                               │
│  │ JSON Request │    │ TXT Request  │                               │
│  │ Content-Type:│    │ Content-Type:│                               │
│  │ application/ │    │ text/plain   │                               │
│  │ json         │    │ X-Tenant-ID  │                               │
│  └──────┬───────┘    └──────┬───────┘                               │
│         │                   │                                       │
│         └─────────┬─────────┘                                       │
│                   ▼                                                 │
│         ┌──────────────────┐                                        │
│         │   Cloud Run      │                                        │
│         │   (Ingestion)    │                                        │
│         │   POST /ingest   │                                        │
│         │   Returns 202    │                                        │
│         └────────┬─────────┘                                        │
│                  │                                                  │
│                  ▼                                                  │
│         ┌──────────────────┐                                        │
│         │   Pub/Sub Topic  │                                        │
│         │   log-processing │                                        │
│         └────────┬─────────┘                                        │
│                  │                                                  │
└──────────────────┼──────────────────────────────────────────────────┘
                   │
┌──────────────────┼──────────────────────────────────────────────────┐
│                  ▼           PROCESSING FLOW                        │
│         ┌──────────────────┐                                        │
│         │   Cloud Run      │                                        │
│         │   (Worker)       │                                        │
│         │   Pub/Sub Push   │                                        │
│         └────────┬─────────┘                                        │
│                  │                                                  │
└──────────────────┼──────────────────────────────────────────────────┘
                   │
┌──────────────────┼──────────────────────────────────────────────────┐
│                  ▼           STORAGE (FIRESTORE)                    │
│                                                                     │
│         tenants (collection)                                        │
│         ├── acme_corp (document)                                    │
│         │   └── processed_logs (subcollection)                      │
│         │       ├── log_001                                         │
│         │       ├── log_002                                         │
│         │       └── log_003                                         │
│         └── beta_inc (document)                                     │
│             └── processed_logs (subcollection)                      │
│                 ├── log_001                                         │
│                 └── log_002                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
robust-data-processor/
├── ingestion-service/
│   ├── src/
│   │   └── index.js
│   ├── package.json
│   └── Dockerfile
├── worker-service/
│   ├── src/
│   │   └── index.js
│   ├── package.json
│   └── Dockerfile
└── README.md
```

## Multi-Tenant Data Isolation

Firestore subcollections provide **physical separation** of tenant data:

```
/tenants/{tenant_id}/processed_logs/{log_id}
```

When inspected in Firebase Console:

- Each tenant is a separate document
- Each tenant's logs are in isolated subcollections
- No cross-tenant data access possible

## Tech Stack

| Component | GCP Service |
|-----------|-------------|
| API | Cloud Run (Ingestion) |
| Message Broker | Pub/Sub |
| Worker | Cloud Run (Worker) |
| Database | Firestore |

## Crash Recovery

1. **Pub/Sub Acknowledgement**: Messages only removed after successful processing
2. **Dead Letter Topic**: Failed messages after retries go to DLT
3. **Retry Policy**: Exponential backoff with max 5 retries
4. **Idempotency**: Using `log_id` prevents duplicate processing
