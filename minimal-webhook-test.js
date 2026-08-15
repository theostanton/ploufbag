/**
 * Minimal webhook test script
 * This tests the webhook functionality without all the TypeScript complexity
 */

const express = require('express');
const app = express();

app.use(express.json());

// Basic webhook endpoint
app.post('/', (req, res) => {
    console.log('Received webhook:', JSON.stringify(req.body, null, 2));
    
    const payload = req.body;
    
    // Validate basic Strava webhook structure
    if (!payload.object_type || !payload.object_id || !payload.aspect_type || !payload.owner_id) {
        console.error('Invalid webhook payload - missing required fields');
        return res.status(400).json({ error: 'Invalid webhook payload' });
    }
    
    // Respond to Strava quickly
    res.status(200).json({
        status: 'received',
        message: 'Webhook event received',
        event_type: payload.aspect_type,
        object_type: payload.object_type,
        object_id: payload.object_id,
        owner_id: payload.owner_id
    });
    
    // Log the processing
    console.log(`✅ Webhook processed: ${payload.aspect_type} ${payload.object_type} ${payload.object_id} for pilot ${payload.owner_id}`);
});

// Handle challenge verification
app.get('/', (req, res) => {
    const challenge = req.query['hub.challenge'];
    const mode = req.query['hub.mode'];
    
    if (mode === 'subscribe' && challenge) {
        console.log('✅ Webhook subscription challenge verified');
        return res.status(200).json({ 'hub.challenge': challenge });
    }
    
    res.status(200).json({
        status: 'OK',
        message: 'Plouf Bag webhook endpoint',
        endpoints: {
            subscription: 'GET with hub.mode=subscribe&hub.challenge=<challenge>',
            events: 'POST with Strava webhook payload'
        }
    });
});

const PORT = process.env.WEBHOOKS_PORT || 3003;
app.listen(PORT, () => {
    console.log(`🚀 Minimal webhook server running on port ${PORT}`);
    console.log('📡 Ready to receive Strava webhook events');
    console.log('🔗 Test with: curl -X POST http://localhost:' + PORT + ' -H "Content-Type: application/json" -d \'{"object_type":"activity","object_id":123,"aspect_type":"create","owner_id":456}\'');
});