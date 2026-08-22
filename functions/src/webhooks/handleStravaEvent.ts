import { Request, Response } from "express";
import {
    StravaWebhookEvent,
    WebhookEventStatus,
    WebhookEventType,
    WebhookObjectType,
    WebhookEvents,
    TaskExecutions,
    withPooledClient,
    Pilots as PilotsCommon,
    isSuccess, isFailure
} from "@ploufbag/common";
import { executeUpdateSingleActivityTask } from "../tasks/updateSingleActivity";
import { executeUpdateDescriptionTask } from "../tasks/updateDescription";
import { Flights } from "../model/database/Flights";
import { Pilots } from "../model/database/Pilots";

/**
 * Handle incoming Strava webhook events
 * Logs all events to monitoring and processes relevant ones
 */
export async function handleStravaEvent(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    
    try {
        // Parse webhook payload
        const payload: StravaWebhookEvent = req.body;
        console.log("Received Strava webhook event:", JSON.stringify(payload, null, 2));

        // Validate required fields
        if (!payload.object_type || !payload.object_id || !payload.aspect_type || !payload.owner_id) {
            console.error("Invalid webhook payload - missing required fields");
            res.status(400).json({ error: "Invalid webhook payload" });
            return;
        }

        // Convert to our enum types
        const eventType = payload.aspect_type as WebhookEventType;
        const objectType = payload.object_type as WebhookObjectType;

        // Log webhook event to monitoring database
        const webhookEventResult = await withPooledClient(async (client) => {
            return await WebhookEvents.create(client, {
                event_type: eventType,
                object_type: objectType,
                object_id: payload.object_id.toString(),
                pilot_id: payload.owner_id,
                payload: payload
            });
        });

        if (!webhookEventResult[0]) {
            console.error("Failed to log webhook event:", webhookEventResult[1]);
            res.status(500).json({ error: "Failed to log webhook event" });
            return;
        }

        const webhookEvent = webhookEventResult[0];
        console.log(`Logged webhook event with ID: ${webhookEvent.id}`);

        // Process event synchronously before responding
        await processWebhookEvent(webhookEvent.id, payload, startTime);

        // Respond to Strava after processing is complete
        res.status(200).json({
            status: "processed",
            event_id: webhookEvent.id
        });

    } catch (error) {
        console.error("Error handling Strava webhook:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * Process webhook event synchronously
 */
async function processWebhookEvent(
    webhookEventId: string,
    payload: StravaWebhookEvent,
    startTime: number
): Promise<void> {
    try {
        console.log(`Processing webhook event ${webhookEventId}`);

        // Update status to processing
        await withPooledClient(async (client) => {
            await WebhookEvents.updateStatus(client, webhookEventId, {
                status: WebhookEventStatus.Processing
            });
        });

        // Determine if we should process this event
        const shouldProcess = await shouldProcessEvent(payload);
        
        if (!shouldProcess.process) {
            console.log(`Ignoring webhook event: ${shouldProcess.reason}`);
            
            // Mark as ignored
            const processingTime = Date.now() - startTime;
            await withPooledClient(async (client) => {
                await WebhookEvents.updateStatus(client, webhookEventId, {
                    status: WebhookEventStatus.Ignored,
                    processed_at: new Date(),
                    processing_duration_ms: processingTime
                });
            });
            return;
        }

        // Process the event based on type
        let taskId: string | null = null;

        if (payload.object_type === 'activity') {
            taskId = await processActivityEvent(webhookEventId, payload);
        } else if (payload.object_type === 'athlete') {
            await processAthleteEvent(webhookEventId, payload);
        }

        // Mark webhook as completed
        const processingTime = Date.now() - startTime;
        await withPooledClient(async (client) => {
            await WebhookEvents.updateStatus(client, webhookEventId, {
                status: WebhookEventStatus.Completed,
                processed_at: new Date(),
                processing_duration_ms: processingTime
            });
        });

        console.log(`Successfully processed webhook event ${webhookEventId} in ${processingTime}ms`);

    } catch (error) {
        console.error(`Error processing webhook event ${webhookEventId}:`, error);

        const processingTime = Date.now() - startTime;

        // Check if this is an ignored activity
        if (error instanceof Error && error.name === 'ActivityIgnoredError') {
            console.log(`Marking webhook event ${webhookEventId} as ignored: ${error.message}`);
            await withPooledClient(async (client) => {
                await WebhookEvents.updateStatus(client, webhookEventId, {
                    status: WebhookEventStatus.Ignored,
                    processed_at: new Date(),
                    processing_duration_ms: processingTime,
                    error_message: error.message
                });
            });
        } else {
            // Mark webhook as failed
            await withPooledClient(async (client) => {
                await WebhookEvents.updateStatus(client, webhookEventId, {
                    status: WebhookEventStatus.Failed,
                    processed_at: new Date(),
                    processing_duration_ms: processingTime,
                    error_message: error instanceof Error ? error.message : String(error)
                });
            });
        }
    }
}

/**
 * Determine if we should process this webhook event
 */
async function shouldProcessEvent(payload: StravaWebhookEvent): Promise<{
    process: boolean;
    reason: string;
}> {
    // Only process activity events for now
    if (payload.object_type !== 'activity') {
        return {
            process: false,
            reason: `Object type '${payload.object_type}' not supported`
        };
    }

    // Check if pilot exists in our system (skip this check for delete events)
    if (payload.aspect_type !== 'delete') {
        const pilotResult = await withPooledClient(async (client) => {
            return await PilotsCommon.get(payload.owner_id);
        });

        if (!isSuccess(pilotResult)) {
            return {
                process: false,
                reason: `Pilot ${payload.owner_id} not found in our system`
            };
        }
    }

    return {
        process: true,
        reason: 'Event should be processed'
    };
}

/**
 * Custom error class to indicate an activity should be ignored
 */
class ActivityIgnoredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ActivityIgnoredError';
    }
}

/**
 * Process activity-related webhook events
 */
async function processActivityEvent(
    webhookEventId: string,
    payload: StravaWebhookEvent
): Promise<string | null> {
    console.log(`Processing activity event: ${payload.aspect_type} for activity ${payload.object_id}`);

    try {
        // Handle activity deletion
        if (payload.aspect_type === 'delete') {
            console.log(`Deleting activity ${payload.object_id}`);
            const deleteResult = await Flights.deleteByActivityId(payload.object_id.toString());

            if (isFailure(deleteResult)) {
                throw new Error(`Failed to delete flight: ${deleteResult[1]}`);
            }

            console.log(`Successfully deleted activity ${payload.object_id}`);
            return null; // No task triggered for deletion
        }

        // For "update" events, check if the flight already exists in the DB.
        // If it does, skip UpdateSingleActivity to avoid re-extracting the wing
        // from the already-formatted description (which corrupts the wing name
        // due to padding spaces and causes the flight count to drop to 1).
        const activityId = payload.object_id.toString();
        const existingFlight = await Flights.get(activityId);
        const flightAlreadyExists = isSuccess(existingFlight);
        let taskExecutionId: string | null = null;

        if (payload.aspect_type === 'update' && flightAlreadyExists) {
            console.log(`Flight already exists for activity ${activityId}, skipping UpdateSingleActivity on update event`);
        } else {
            // No type gate here any more, and no pre-fetch to apply one.
            //
            // It used to fetch the activity purely to ask isRelevantActivityType,
            // which was hard-coded to Workout and Kitesurf -- so a pilot who logs
            // flights as a Hike had every upload silently ignored at this line,
            // which is the failure this whole change exists to end. Which types
            // count is the pilot's answer now, and the task below is what knows
            // it.
            //
            // Dropping the gate also drops a duplicate request: the task fetches
            // the same activity again a moment later, and Strava's limits are
            // per fifteen minutes.
            //
            // Everything reaching here is recorded in `activities`, including
            // what turns out not to be a flight. That record is what makes the
            // empty state able to say "you have 340 Hikes, is that where they
            // are?" rather than guessing.
            const taskBody = {
                name: "UpdateSingleActivity" as const,
                pilotId: payload.owner_id,
                activityId: activityId
            };

            const taskResult = await executeUpdateSingleActivityTask(taskBody);

            if (!taskResult.success) {
                throw new Error(`Failed to execute UpdateSingleActivity task: ${taskResult.message}`);
            }

            // Log task execution to monitoring
            const taskExecutionResult = await withPooledClient(async (client) => {
                return await TaskExecutions.create(client, {
                    task_name: "UpdateSingleActivity",
                    task_payload: taskBody,
                    triggered_by: `webhook_event`,
                    triggered_by_webhook_id: webhookEventId,
                    pilot_id: payload.owner_id
                });
            });

            if (!taskExecutionResult[0]) {
                console.error("Failed to log task execution:", taskExecutionResult[1]);
                return null;
            }

            taskExecutionId = taskExecutionResult[0].id;
            console.log(`Triggered UpdateSingleActivity task with execution ID: ${taskExecutionId}`);
        }

        // Chain description update task for automatic stats updates
        console.log(`Executing UpdateDescription task for activity ${payload.object_id}`);
        const descriptionTaskBody = {
            name: "UpdateDescription" as const,
            flightId: activityId
        };

        const descriptionTaskResult = await executeUpdateDescriptionTask(descriptionTaskBody);

        if (!descriptionTaskResult.success) {
            console.error(`Failed to execute UpdateDescription task: ${descriptionTaskResult.message}`);
            // Don't throw - description update is optional, activity sync already succeeded
        } else {
            // Log description update task execution
            await withPooledClient(async (client) => {
                return await TaskExecutions.create(client, {
                    task_name: "UpdateDescription",
                    task_payload: descriptionTaskBody,
                    triggered_by: `webhook_event`,
                    triggered_by_webhook_id: webhookEventId,
                    pilot_id: payload.owner_id
                });
            });
            console.log(`Triggered UpdateDescription task for activity ${payload.object_id}`);
        }

        return taskExecutionId;

    } catch (error) {
        console.error("Error processing activity event:", error);
        throw error;
    }
}

/**
 * Process athlete-related webhook events (e.g., deauthorization)
 */
async function processAthleteEvent(
    webhookEventId: string,
    payload: StravaWebhookEvent
): Promise<void> {
    console.log(`Processing athlete event: ${payload.aspect_type} for athlete ${payload.object_id}`);

    // Handle athlete deauthorization
    if (payload.aspect_type === 'update' && payload.updates?.authorized === false) {
        console.log(`Athlete ${payload.object_id} has deauthorized the application`);

        const deauthResult = await Pilots.deauthorize(payload.owner_id);

        if (isFailure(deauthResult)) {
            throw new Error(`Failed to deauthorize pilot: ${deauthResult[1]}`);
        }

        console.log(`Successfully deauthorized pilot ${payload.owner_id}`);
    }
}

/**
 * Verify Strava webhook signature using HMAC-SHA256
 */
export function verifyStravaSignature(req: Request): boolean {
    const signature = req.headers['x-hub-signature-256'] as string;
    const secret = process.env.STRAVA_WEBHOOK_SECRET;

    if (!signature || !secret) {
        console.error("Missing signature or webhook secret");
        return false;
    }

    try {
        const crypto = require('crypto');

        // Compute HMAC-SHA256 of raw request body
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(JSON.stringify(req.body));
        const computedSignature = `sha256=${hmac.digest('hex')}`;

        // Constant-time comparison to prevent timing attacks
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(computedSignature)
        );
    } catch (error) {
        console.error("Error verifying signature:", error);
        return false;
    }
}