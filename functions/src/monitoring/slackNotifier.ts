/**
 * Mirrors monitoring failures to Slack through an Incoming Webhook.
 *
 * The /admin panel records every task execution and webhook event, but only
 * someone who logs in sees them. This posts the ones that need a person:
 * failed tasks, failed webhook events, and a retried task that went on to
 * succeed. Nothing else is posted.
 *
 * Disabled unless SLACK_EVENTS_WEBHOOK_URL is set. Read at call time rather
 * than at import, so tests can toggle it.
 *
 * notifySlack never throws and gives up after a few seconds. Callers await it
 * (Cloud Run may freeze the CPU once the response is sent, so fire-and-forget
 * is not reliable there), and a Slack outage must not change a task result or
 * a webhook status.
 */

export const SLACK_TIMEOUT_MS = 3000;
export const MAX_ERROR_LENGTH = 500;

export interface SlackMessage {
    text: string;
    blocks?: unknown[];
}

export interface TaskFailure {
    executionId: string | null | undefined;
    taskName: string;
    pilotId: number | string | null | undefined;
    retryCount: number;
    errorMessage: string | null | undefined;
    durationMs: number;
}

export interface WebhookFailure {
    webhookEventId: string;
    eventType: string;
    objectType: string;
    objectId: number | string;
    pilotId: number | string | null | undefined;
    errorMessage: string | null | undefined;
    durationMs: number;
}

export interface TaskRecovered {
    executionId: string | null | undefined;
    taskName: string;
    pilotId: number | string | null | undefined;
    retryCount: number;
    durationMs: number;
}

export function truncate(message: string, max: number = MAX_ERROR_LENGTH): string {
    return message.length > max ? `${message.slice(0, max)}… (truncated)` : message;
}

function orUnknown(value: number | string | null | undefined): string {
    return value === null || value === undefined || value === "" ? "unknown" : String(value);
}

function errorText(message: string | null | undefined): string {
    return message ? truncate(message) : "(no error message)";
}

export function formatTaskFailure(failure: TaskFailure): SlackMessage {
    const retry = failure.retryCount > 0 ? ` (retry ${failure.retryCount})` : "";
    return {
        text: [
            `:x: Task ${failure.taskName} failed${retry}`,
            `*Pilot:* ${orUnknown(failure.pilotId)}`,
            `*Status:* failed`,
            `*Duration:* ${failure.durationMs}ms`,
            `*Execution:* ${orUnknown(failure.executionId)}`,
            `*Error:* ${errorText(failure.errorMessage)}`
        ].join("\n")
    };
}

export function formatWebhookFailure(failure: WebhookFailure): SlackMessage {
    return {
        text: [
            `:x: Webhook ${failure.objectType} ${failure.eventType} failed (${failure.objectType} ${failure.objectId})`,
            `*Pilot:* ${orUnknown(failure.pilotId)}`,
            `*Status:* failed`,
            `*Duration:* ${failure.durationMs}ms`,
            `*Webhook event:* ${failure.webhookEventId}`,
            `*Error:* ${errorText(failure.errorMessage)}`
        ].join("\n")
    };
}

export function formatTaskRecovered(recovered: TaskRecovered): SlackMessage {
    return {
        text: [
            `:white_check_mark: Task ${recovered.taskName} recovered on retry ${recovered.retryCount}`,
            `*Pilot:* ${orUnknown(recovered.pilotId)}`,
            `*Status:* completed`,
            `*Duration:* ${recovered.durationMs}ms`,
            `*Execution:* ${orUnknown(recovered.executionId)}`
        ].join("\n")
    };
}

export async function notifySlack(message: SlackMessage): Promise<void> {
    const url = process.env.SLACK_EVENTS_WEBHOOK_URL;
    if (!url) {
        return;
    }

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(message),
            signal: AbortSignal.timeout(SLACK_TIMEOUT_MS)
        });

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            console.error(`Slack notification rejected: ${response.status} ${body}`);
        }
    } catch (error) {
        console.error("Slack notification failed:", error);
    }
}
