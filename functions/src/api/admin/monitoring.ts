import { Request, Response } from "express";
import {
    WebhookEventStatus,
    TaskExecutionStatus,
    WebhookEvents,
    TaskExecutions,
    withPooledClient
} from "@ploufbag/common";
import { retryFailedTasks } from "../../tasks/monitoredTaskExecutor";

/**
 * GET /admin/webhooks - Get recent webhook events
 */
export async function getWebhookEvents(req: Request, res: Response): Promise<void> {
    try {
        const {
            limit = 50,
            offset = 0,
            status,
            pilot_id,
            hours_back = 24
        } = req.query;

        const result = await withPooledClient(async (client) => {
            return await WebhookEvents.getRecent(client, {
                limit: parseInt(limit as string),
                offset: parseInt(offset as string),
                status: status as WebhookEventStatus,
                pilot_id: pilot_id ? parseInt(pilot_id as string) : undefined,
                hours_back: parseInt(hours_back as string)
            });
        });

        if (!result[0]) {
            res.status(500).json({ error: result[1] });
            return;
        }

        res.json({
            webhooks: result[0],
            pagination: {
                limit: parseInt(limit as string),
                offset: parseInt(offset as string)
            }
        });

    } catch (error) {
        console.error("Error getting webhook events:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * GET /admin/webhooks/with-tasks - Get webhook events with task counts
 */
export async function getWebhookEventsWithTasks(req: Request, res: Response): Promise<void> {
    try {
        const {
            limit = 50,
            offset = 0,
            hours_back = 24
        } = req.query;

        const result = await withPooledClient(async (client) => {
            return await WebhookEvents.getWithTasks(client, {
                limit: parseInt(limit as string),
                offset: parseInt(offset as string),
                hours_back: parseInt(hours_back as string)
            });
        });

        if (!result[0]) {
            res.status(500).json({ error: result[1] });
            return;
        }

        res.json({
            webhooks: result[0],
            pagination: {
                limit: parseInt(limit as string),
                offset: parseInt(offset as string)
            }
        });

    } catch (error) {
        console.error("Error getting webhook events with tasks:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * GET /admin/tasks - Get recent task executions
 */
export async function getTaskExecutions(req: Request, res: Response): Promise<void> {
    try {
        const {
            limit = 50,
            offset = 0,
            status,
            task_name,
            pilot_id,
            hours_back = 24,
            webhook_id
        } = req.query;

        const result = await withPooledClient(async (client) => {
            return await TaskExecutions.getRecent(client, {
                limit: parseInt(limit as string),
                offset: parseInt(offset as string),
                status: status as TaskExecutionStatus,
                task_name: task_name as any,
                pilot_id: pilot_id ? parseInt(pilot_id as string) : undefined,
                hours_back: parseInt(hours_back as string),
                triggered_by_webhook_id: webhook_id as string
            });
        });

        if (!result[0]) {
            res.status(500).json({ error: result[1] });
            return;
        }

        res.json({
            tasks: result[0],
            pagination: {
                limit: parseInt(limit as string),
                offset: parseInt(offset as string)
            }
        });

    } catch (error) {
        console.error("Error getting task executions:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * GET /admin/monitoring/activity - Get recent monitoring activity (combined view)
 */
export async function getMonitoringActivity(req: Request, res: Response): Promise<void> {
    try {
        const {
            limit = 100,
            hours_back = 24,
            pilot_id
        } = req.query;

        const result = await withPooledClient(async (client) => {
            return await TaskExecutions.getRecentMonitoringActivity(client, {
                limit: parseInt(limit as string),
                hours_back: parseInt(hours_back as string),
                pilot_id: pilot_id ? parseInt(pilot_id as string) : undefined
            });
        });

        if (!result[0]) {
            res.status(500).json({ error: result[1] });
            return;
        }

        res.json({
            activity: result[0],
            filters: {
                limit: parseInt(limit as string),
                hours_back: parseInt(hours_back as string),
                pilot_id: pilot_id ? parseInt(pilot_id as string) : null
            }
        });

    } catch (error) {
        console.error("Error getting monitoring activity:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * GET /admin/monitoring/stats - Get monitoring statistics
 */
export async function getMonitoringStats(req: Request, res: Response): Promise<void> {
    try {
        const { hours_back = 24 } = req.query;
        const hoursBack = parseInt(hours_back as string);

        // Get webhook and task stats in parallel
        const [webhookStatsResult, taskStatsResult] = await Promise.all([
            withPooledClient(async (client) => {
                return await WebhookEvents.getStats(client, hoursBack);
            }),
            withPooledClient(async (client) => {
                return await TaskExecutions.getStats(client, hoursBack);
            })
        ]);

        if (!webhookStatsResult[0]) {
            res.status(500).json({ error: `Webhook stats error: ${webhookStatsResult[1]}` });
            return;
        }

        if (!taskStatsResult[0]) {
            res.status(500).json({ error: `Task stats error: ${taskStatsResult[1]}` });
            return;
        }

        res.json({
            period_hours: hoursBack,
            webhooks: webhookStatsResult[0],
            tasks: taskStatsResult[0],
            generated_at: new Date().toISOString()
        });

    } catch (error) {
        console.error("Error getting monitoring stats:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * POST /admin/webhooks/{id}/retry - Retry a failed webhook
 */
export async function retryWebhook(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;

        if (!id) {
            res.status(400).json({ error: "Webhook ID is required" });
            return;
        }

        // Get the webhook event
        const webhookResult = await withPooledClient(async (client) => {
            return await WebhookEvents.get(client, id);
        });

        if (!webhookResult[0]) {
            res.status(404).json({ error: "Webhook event not found" });
            return;
        }

        const webhook = webhookResult[0];

        // Check if webhook can be retried
        if (webhook.status !== WebhookEventStatus.Failed) {
            res.status(400).json({ 
                error: `Webhook is in '${webhook.status}' status, can only retry failed webhooks` 
            });
            return;
        }

        // Increment retry count and reset status
        const retryResult = await withPooledClient(async (client) => {
            return await WebhookEvents.incrementRetryCount(client, id);
        });

        if (!retryResult[0]) {
            res.status(500).json({ error: `Failed to increment retry count: ${retryResult[1]}` });
            return;
        }

        // TODO: Re-trigger webhook processing
        // For now, just mark it as pending and let the retry mechanism handle it

        res.json({
            message: "Webhook retry initiated",
            webhook_id: id,
            retry_count: retryResult[0].retry_count
        });

    } catch (error) {
        console.error("Error retrying webhook:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * POST /admin/tasks/{id}/retry - Retry a failed task
 */
export async function retryTask(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;

        if (!id) {
            res.status(400).json({ error: "Task execution ID is required" });
            return;
        }

        // Get the task execution
        const taskResult = await withPooledClient(async (client) => {
            return await TaskExecutions.get(client, id);
        });

        if (!taskResult[0]) {
            res.status(404).json({ error: "Task execution not found" });
            return;
        }

        const task = taskResult[0];

        // Check if task can be retried
        if (task.status !== TaskExecutionStatus.Failed) {
            res.status(400).json({ 
                error: `Task is in '${task.status}' status, can only retry failed tasks` 
            });
            return;
        }

        // Increment retry count
        const retryResult = await withPooledClient(async (client) => {
            return await TaskExecutions.incrementRetryCount(client, id);
        });

        if (!retryResult[0]) {
            res.status(500).json({ error: `Failed to increment retry count: ${retryResult[1]}` });
            return;
        }

        // TODO: Re-trigger task execution
        // For now, just mark it as pending and let the retry mechanism handle it

        res.json({
            message: "Task retry initiated", 
            task_id: id,
            retry_count: retryResult[0].retry_count
        });

    } catch (error) {
        console.error("Error retrying task:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * POST /admin/monitoring/retry-failed - Retry all failed webhooks and tasks
 */
export async function retryAllFailed(req: Request, res: Response): Promise<void> {
    try {
        const { max_retries = 3 } = req.body;

        console.log(`Starting retry of all failed tasks with max_retries=${max_retries}`);
        
        // Retry failed tasks
        await retryFailedTasks(max_retries);

        // TODO: Also retry failed webhooks
        
        res.json({
            message: "Retry process initiated for all failed tasks",
            max_retries
        });

    } catch (error) {
        console.error("Error retrying all failed:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}