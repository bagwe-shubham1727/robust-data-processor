const express = require('express');
const { Firestore } = require('@google-cloud/firestore');

const app = express();
const firestore = new Firestore();

const PORT = process.env.PORT || 8080;

// Middleware to parse JSON (Pub/Sub push messages)
app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.status(200).json({ status: 'healthy', service: 'worker' });
});

// Simulate heavy processing (0.05s per character)
const simulateProcessing = async (text) => {
    const processingTimeMs = text.length * 50; // 50ms per character

    // Cap at 9 minutes to stay within Cloud Run timeout (10 min default)
    const cappedTime = Math.min(processingTimeMs, 9 * 60 * 1000);

    console.log(JSON.stringify({
        event: 'processing_started',
        text_length: text.length,
        processing_time_ms: cappedTime
    }));

    // Sleep in chunks for better logging
    const chunkSize = 5000; // 5 second chunks
    let elapsed = 0;

    while (elapsed < cappedTime) {
        const sleepTime = Math.min(chunkSize, cappedTime - elapsed);
        await new Promise(resolve => setTimeout(resolve, sleepTime));
        elapsed += sleepTime;
    }

    return cappedTime;
};

// Simple PII redaction
const redactPII = (text) => {
    let redacted = text;

    // Phone numbers
    redacted = redacted.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED-PHONE]');

    // Email addresses
    redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED-EMAIL]');

    // SSN patterns
    redacted = redacted.replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, '[REDACTED-SSN]');

    return redacted;
};

// Check if log already processed (idempotency)
const checkIfProcessed = async (tenantId, logId) => {
    const docRef = firestore
        .collection('tenants')
        .doc(tenantId)
        .collection('processed_logs')
        .doc(logId);

    const doc = await docRef.get();
    return doc.exists;
};

// Store processed log to Firestore
// Path: tenants/{tenant_id}/processed_logs/{log_id}
const storeProcessedLog = async (data) => {
    const docRef = firestore
        .collection('tenants')
        .doc(data.tenant_id)
        .collection('processed_logs')
        .doc(data.log_id);

    const document = {
        source: data.source,
        original_text: data.original_text,
        modified_data: data.modified_data,
        text_length: data.text_length,
        processing_time_ms: data.processing_time,
        received_at: data.received_at,
        processed_at: new Date().toISOString(),
        status: 'completed'
    };

    // Use create() instead of set() - fails if document already exists
    await docRef.create(document);

    // Also update tenant document metadata
    const tenantRef = firestore.collection('tenants').doc(data.tenant_id);
    await tenantRef.set({
        last_updated: new Date().toISOString(),
        tenant_id: data.tenant_id
    }, { merge: true });

    return document;
};

// Pub/Sub push endpoint
app.post('/process', async (req, res) => {
    const startTime = Date.now();

    try {
        // Pub/Sub sends messages in a specific format
        if (!req.body || !req.body.message) {
            console.error('Invalid Pub/Sub message format');
            return res.status(400).json({ error: 'Invalid message format' });
        }

        // Decode the Pub/Sub message
        const pubsubMessage = req.body.message;
        const messageData = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
        const message = JSON.parse(messageData);

        console.log(JSON.stringify({
            event: 'message_received',
            tenant_id: message.tenant_id,
            log_id: message.log_id,
            text_length: message.text?.length,
            message_id: pubsubMessage.messageId
        }));

        // Idempotency check
        const alreadyProcessed = await checkIfProcessed(message.tenant_id, message.log_id);
        if (alreadyProcessed) {
            console.log(JSON.stringify({
                event: 'duplicate_skipped',
                log_id: message.log_id
            }));
            return res.status(409).json({ status: 'skipped', reason: 'duplicate' });
        }

        // Simulate heavy processing
        const processingTime = await simulateProcessing(message.text);

        // Redact PII
        const redactedText = redactPII(message.text);

        // Store to Firestore: tenants/{tenant_id}/processed_logs/{log_id}
        try {
            const storedDoc = await storeProcessedLog({
                tenant_id: message.tenant_id,
                log_id: message.log_id,
                source: message.source,
                original_text: message.text,
                modified_data: redactedText,
                text_length: message.text.length,
                processing_time: processingTime,
                received_at: message.received_at
            });

            console.log(JSON.stringify({
                event: 'processing_complete',
                tenant_id: message.tenant_id,
                log_id: message.log_id,
                path: `tenants/${message.tenant_id}/processed_logs/${message.log_id}`,
                total_time_ms: Date.now() - startTime
            }));

            // Acknowledge the message (202 = created)
            return res.status(202).json({
                status: 'processed',
                log_id: message.log_id,
                path: `tenants/${message.tenant_id}/processed_logs/${message.log_id}`
            });

        } catch (storeError) {
            // If document already exists, create() throws an error - treat as success
            if (storeError.code === 6) { // ALREADY_EXISTS error code
                console.log(JSON.stringify({
                    event: 'duplicate_detected_on_write',
                    log_id: message.log_id
                }));
                return res.status(409).json({ status: 'skipped', reason: 'duplicate' });
            }
            throw storeError; // Re-throw other errors
        }

    } catch (error) {
        console.error(JSON.stringify({
            event: 'processing_error',
            error: error.message,
            stack: error.stack
        }));

        // Return 500 to trigger Pub/Sub retry
        return res.status(500).json({ error: 'Processing failed' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Worker service listening on port ${PORT}`);
});