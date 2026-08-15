import {
    TaskBody,
    TaskResult,
    TaskExecutionStatus,
    TaskExecutions,
    withPooledClient
, isSuccess} from "@ploufbag/common";
import { taskHandlers } from "./model";

/**
 * Execute a task with monitoring and logging
 * This wrapper tracks task execution in the monitoring database
 */
export async function executeMonitoredTask(
    task: TaskBody,
    options: {
        triggeredBy?: string;
        triggeredByWebhookId?: string;
        executionId?: string;
    } = {}
): Promise<TaskResult> {
    const startTime = Date.now();
    let executionId = options.executionId;

    try {
        // Create task execution record if not provided
        if (!executionId) {
            const createResult = await withPooledClient(async (client) => {
                return await TaskExecutions.create(client, {
                    task_name: task.name as any,
                    task_payload: task,
                    triggered_by: options.triggeredBy || 'direct',
                    triggered_by_webhook_id: options.triggeredByWebhookId,
                    pilot_id: extractPilotId(task)
                });
            });

            if (!createResult[0]) {
                console.error("Failed to create task execution record:", createResult[1]);
                // Continue execution even if monitoring fails
                executionId = "unknown";
            } else {
                executionId = createResult[0].id;
            }
        }

        console.log(`Starting task execution ${executionId}: ${task.name}`);

        // Update status to running
        if (executionId !== "unknown") {
            await withPooledClient(async (client) => {
                await TaskExecutions.updateStatus(client, executionId!, {
                    status: TaskExecutionStatus.Running
                });
            });
        }

        // Execute the actual task
        const handler = taskHandlers[task.name as keyof typeof taskHandlers];
        if (!handler) {
            throw new Error(`No handler found for task: ${task.name}`);
        }

        const result = await handler(task);
        const executionTime = Date.now() - startTime;

        // Update task execution status based on result
        if (executionId !== "unknown") {
            await withPooledClient(async (client) => {
                await TaskExecutions.updateStatus(client, executionId!, {
                    status: result.success ? TaskExecutionStatus.Completed : TaskExecutionStatus.Failed,
                    completed_at: new Date(),
                    execution_duration_ms: executionTime,
                    error_message: result.success ? null : result.message
                });
            });
        }

        console.log(`Task execution ${executionId} ${result.success ? 'completed' : 'failed'} in ${executionTime}ms`);
        
        return result;

    } catch (error) {
        const executionTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        console.error(`Task execution ${executionId} failed:`, error);

        // Update task execution status to failed
        if (executionId && executionId !== "unknown") {
            try {
                await withPooledClient(async (client) => {
                    await TaskExecutions.updateStatus(client, executionId!, {
                        status: TaskExecutionStatus.Failed,
                        completed_at: new Date(),
                        execution_duration_ms: executionTime,
                        error_message: errorMessage
                    });
                });
            } catch (monitoringError) {
                console.error("Failed to update task execution status:", monitoringError);
            }
        }

        return {
            success: false,
            message: errorMessage
        };
    }
}

/**
 * Extract pilot ID from task payload for monitoring
 */
function extractPilotId(task: TaskBody): number | null {
    try {
        // Extract pilot ID based on task type
        switch (task.name) {
            case "FetchAllActivities":
                return (task as any).pilotId || null;
            case "UpdateDescription":
                // For UpdateDescription, we'd need to look up the flight to get pilot ID
                // For now, return null and let the task execution handle it
                return null;
            case "SyncSites":
            case "HelloWorld":
                return null;
            default:
                return null;
        }
    } catch (error) {
        console.error("Error extracting pilot ID from task:", error);
        return null;
    }
}

/**
 * Retry failed task executions
 */
export async function retryFailedTasks(maxRetries: number = 3): Promise<void> {
    try {
        console.log("Checking for failed tasks to retry...");

        const pendingRetries = await withPooledClient(async (client) => {
            return await TaskExecutions.getPendingRetries(client, maxRetries);
        });

        if (!pendingRetries[0]) {
            console.error("Failed to get pending retries:", pendingRetries[1]);
            return;
        }

        const tasks = pendingRetries[0];
        console.log(`Found ${tasks.length} tasks to retry`);

        for (const taskExecution of tasks) {
            try {
                console.log(`Retrying task execution ${taskExecution.id}`);

                // Increment retry count
                await withPooledClient(async (client) => {
                    await TaskExecutions.incrementRetryCount(client, taskExecution.id);
                });

                // Re-execute the task
                const result = await executeMonitoredTask(
                    taskExecution.task_payload,
                    {
                        executionId: taskExecution.id,
                        triggeredBy: `retry_${taskExecution.retry_count + 1}`,
                        triggeredByWebhookId: taskExecution.triggered_by_webhook_id || undefined
                    }
                );

                console.log(`Retry of task ${taskExecution.id} ${result.success ? 'succeeded' : 'failed'}`);

            } catch (error) {
                console.error(`Failed to retry task ${taskExecution.id}:`, error);
            }
        }

    } catch (error) {
        console.error("Error in retryFailedTasks:", error);
    }
}