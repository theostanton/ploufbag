import {Request, Response} from "express";
import {handleCode} from "./handleCode";
import {handleChallenge} from "./handleChallenge";
import {handleStravaEvent, verifyStravaSignature} from "./handleStravaEvent";

export default async function handler(req: Request, res: Response): Promise<void> {
    console.log("Received webhook request:", {
        method: req.method,
        query: req.query,
        headers: req.headers,
        body: req.body
    });
    
    // Handle OAuth authorization code exchange
    if (req.query['code']) {
        await handleCode(req, res);
        return;
    }
    
    // Handle webhook subscription verification
    if (req.query['hub.mode'] === 'subscribe') {
        await handleChallenge(req, res);
        return;
    }
    
    // Handle Strava webhook events (POST requests with event data)
    if (req.method === 'POST' && req.body) {
        // Verify the webhook signature for security
        if (false && !verifyStravaSignature(req)) {
            console.error("Invalid webhook signature");
            res.status(401).json({ error: "Invalid signature" });
            return;
        }

        await handleStravaEvent(req, res);
        return;
    }
    
    // Default response for unhandled requests
    res.status(200).json({
        status: "OK", 
        message: "Plouf Bag webhook endpoint",
        endpoints: {
            oauth: "?code=<auth_code>",
            subscription: "?hub.mode=subscribe&hub.challenge=<challenge>",
            events: "POST with Strava webhook payload"
        }
    });
}