import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    MAX_ERROR_LENGTH,
    SLACK_TIMEOUT_MS,
    formatTaskFailure,
    formatTaskRecovered,
    formatWebhookFailure,
    notifySlack
} from "./slackNotifier";

const URL = "https://hooks.slack.test/services/T/B/X";

describe("formatTaskFailure", () => {
    it("names the task, retry, pilot, status, duration, execution and error", () => {
        const { text } = formatTaskFailure({
            executionId: "exec-1",
            taskName: "FetchAllActivities",
            pilotId: 42,
            retryCount: 2,
            errorMessage: "Strava said no",
            durationMs: 1234
        });

        expect(text).toContain(":x: Task FetchAllActivities failed (retry 2)");
        expect(text).toContain("*Pilot:* 42");
        expect(text).toContain("*Status:* failed");
        expect(text).toContain("*Duration:* 1234ms");
        expect(text).toContain("*Execution:* exec-1");
        expect(text).toContain("*Error:* Strava said no");
    });

    it("omits the retry on a first attempt and reports a missing pilot as unknown", () => {
        const { text } = formatTaskFailure({
            executionId: "exec-1",
            taskName: "SyncSites",
            pilotId: null,
            retryCount: 0,
            errorMessage: undefined,
            durationMs: 5
        });

        expect(text).toContain(":x: Task SyncSites failed\n");
        expect(text).not.toContain("retry");
        expect(text).toContain("*Pilot:* unknown");
        expect(text).toContain("*Error:* (no error message)");
    });

    it("truncates a very long error", () => {
        const { text } = formatTaskFailure({
            executionId: "exec-1",
            taskName: "SyncSites",
            pilotId: null,
            retryCount: 0,
            errorMessage: "x".repeat(5000),
            durationMs: 5
        });

        expect(text).toContain("x".repeat(MAX_ERROR_LENGTH) + "… (truncated)");
        expect(text).not.toContain("x".repeat(MAX_ERROR_LENGTH + 1));
    });
});

describe("formatWebhookFailure", () => {
    it("names the event, object, pilot, status, duration, webhook id and error", () => {
        const { text } = formatWebhookFailure({
            webhookEventId: "wh-1",
            eventType: "create",
            objectType: "activity",
            objectId: 987,
            pilotId: 42,
            errorMessage: "Failed to execute UpdateSingleActivity task",
            durationMs: 800
        });

        expect(text).toContain(":x: Webhook activity create failed (activity 987)");
        expect(text).toContain("*Pilot:* 42");
        expect(text).toContain("*Status:* failed");
        expect(text).toContain("*Duration:* 800ms");
        expect(text).toContain("*Webhook event:* wh-1");
        expect(text).toContain("*Error:* Failed to execute UpdateSingleActivity task");
    });
});

describe("formatTaskRecovered", () => {
    it("names the task, retry, pilot, status, duration and execution", () => {
        const { text } = formatTaskRecovered({
            executionId: "exec-1",
            taskName: "FetchAllActivities",
            pilotId: undefined,
            retryCount: 1,
            durationMs: 300
        });

        expect(text).toContain(":white_check_mark: Task FetchAllActivities recovered on retry 1");
        expect(text).toContain("*Pilot:* unknown");
        expect(text).toContain("*Status:* completed");
        expect(text).toContain("*Duration:* 300ms");
        expect(text).toContain("*Execution:* exec-1");
    });
});

describe("notifySlack", () => {
    const message = { text: "hello" };
    let fetchMock: ReturnType<typeof vi.fn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("does nothing when the URL is unset", async () => {
        vi.stubEnv("SLACK_EVENTS_WEBHOOK_URL", undefined as unknown as string);
        await notifySlack(message);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does nothing when the URL is empty", async () => {
        vi.stubEnv("SLACK_EVENTS_WEBHOOK_URL", "");
        await notifySlack(message);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("posts the message as JSON with a timeout", async () => {
        vi.stubEnv("SLACK_EVENTS_WEBHOOK_URL", URL);
        fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));

        await notifySlack(message);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(URL);
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body)).toEqual(message);
        expect(init.signal).toBeInstanceOf(AbortSignal);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("swallows a rejected fetch", async () => {
        vi.stubEnv("SLACK_EVENTS_WEBHOOK_URL", URL);
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));

        await expect(notifySlack(message)).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalled();
    });

    it("swallows a non-2xx response", async () => {
        vi.stubEnv("SLACK_EVENTS_WEBHOOK_URL", URL);
        fetchMock.mockResolvedValue(new Response("invalid_payload", { status: 400 }));

        await expect(notifySlack(message)).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("400 invalid_payload"));
    });

    it("swallows a timeout", async () => {
        vi.stubEnv("SLACK_EVENTS_WEBHOOK_URL", URL);
        // A Slack that never answers: only the abort signal ends the request.
        fetchMock.mockImplementation((_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
                init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
            })
        );
        // Shorten the 3s timeout so the test does not wait for it.
        const realTimeout = AbortSignal.timeout.bind(AbortSignal);
        const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(10));

        await expect(notifySlack(message)).resolves.toBeUndefined();
        expect(timeoutSpy).toHaveBeenCalledWith(SLACK_TIMEOUT_MS);
        expect(errorSpy).toHaveBeenCalledWith(
            "Slack notification failed:",
            expect.objectContaining({ name: "TimeoutError" })
        );
    });
});
