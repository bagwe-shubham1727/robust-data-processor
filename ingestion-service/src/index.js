const express = require('express');
const { PubSub } = require('@google-cloud/pubsub');
const { v4: uuidv4 } = require('uuid');

const app = express();
const pubsub = new PubSub();

const TOPIC_NAME = process.env.PUBSUB_TOPIC || 'log-processing';
const PORT = process.env.PORT || 8080;

// Middleware to parse both JSON and raw text
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));

// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({ status: 'healthy', service: 'ingestion' });
});

// Validate JSON payload
const validateJsonPayload = (body) => {
    if (!body.tenant_id || typeof body.tenant_id !== 'string') {
        return { valid: false, error: 'Missing or invalid tenant_id' };
    }
    if (!body.text || typeof body.text !== 'string') {
        return { valid: false, error: 'Missing or invalid text field' };
    }
    return { valid: true };
};

// Normalize incoming data to internal format
const normalizePayload = (contentType, body, headers) => {
    const isJson = contentType?.includes('application/json');

    if (isJson) {
        const validation = validateJsonPayload(body);
        if (!validation.valid) {
            throw new Error(validation.error);
        }
        return {
            tenant_id: body.tenant_id.toLowerCase().trim(),
            log_id: body.log_id || uuidv4(),
            text: body.text,
            source: 'json_upload',
            received_at: new Date().toISOString()
        };
    }

    // Handle text/plain
    const tenantId = headers['x-tenant-id'];
    if (!tenantId) {
        throw new Error('Missing X-Tenant-ID header for text payload');
    }

    return {
        tenant_id: tenantId.toLowerCase().trim(),
        log_id: uuidv4(),
        text: body,
        source: 'text_upload',
        received_at: new Date().toISOString()
    };
};

// Main ingestion endpoint
app.post('/ingest', async (req, res) => {
    const startTime = Date.now();

    try {
        const contentType = req.headers['content-type'] || '';

        if (!req.body || (typeof req.body === 'object' && Object.keys(req.body).length === 0)) {
            return res.status(400).json({ error: 'Request body is required' });
        }

        // Normalize the payload
        const normalized = normalizePayload(contentType, req.body, req.headers);

        console.log(JSON.stringify({
            event: 'ingestion_received',
            tenant_id: normalized.tenant_id,
            log_id: normalized.log_id,
            text_length: normalized.text.length,
            source: normalized.source
        }));

        // Publish to Pub/Sub
        const topic = pubsub.topic(TOPIC_NAME);
        const messageBuffer = Buffer.from(JSON.stringify(normalized));

        const messageId = await topic.publishMessage({
            data: messageBuffer,
            attributes: {
                tenant_id: normalized.tenant_id,
                source: normalized.source
            }
        });

        console.log(JSON.stringify({
            event: 'message_published',
            message_id: messageId,
            log_id: normalized.log_id,
            latency_ms: Date.now() - startTime
        }));

        // Return 202 Accepted immediately
        return res.status(202).json({
            status: 'accepted',
            message_id: messageId,
            log_id: normalized.log_id,
            tenant_id: normalized.tenant_id
        });

    } catch (error) {
        console.error(JSON.stringify({
            event: 'ingestion_error',
            error: error.message,
            latency_ms: Date.now() - startTime
        }));

        if (error.message.includes('Missing') || error.message.includes('invalid')) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Ingestion service listening on port ${PORT}`);
    console.log(`Publishing to topic: ${TOPIC_NAME}`);
});