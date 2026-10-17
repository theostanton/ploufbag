/**
 * The notifier as its callers use it: one message per failure, one for a
 * recovered retry, none for a first-time success, and nothing Slack does can
 * change a task result or a webhook response. Database and task handlers are
 * mocked; no Testcontainers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
    taskCreate: vi.fn(),
    taskUpdateStatus: vi.fn(),
    webhookCreate: vi.fn(),
    webhookUpdateStatus: vi.fn(),
    pilotGet: vi.fn()
}));
const handlers = vi.hoisted(() => ({
    FetchAllActivities: vi.fn(),
    updateSingleActivity: vi.fn(),
    updateDescription: vi.fn()
}));

vi.mock("@ploufbag/common", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@ploufbag/common")>()),
    withPooledClient: async (fn: (client: unknown) => unknown) => fn({}),
    TaskExecutions: { create: db.taskCreate, updateStatus: db.taskUpdateStatus },
    WebhookEvents: { create: db.webhookCreate, updateStatus: db.webhookUpdateStatus },
    Pilots: { get: db.pilotGet }
}));
vi.mock("../tasks/model", () => ({
    taskHandlers: { FetchAllActivities: handlers.FetchAllActivities }
}));
vi.mock("../tasks/updateSingleActivity", () => ({
    executeUpdateSingleActivityTask: handlers.updateSingleActivity
}));
vi.mock("../tasks/updateDescription", () => ({
    executeUpdateDescriptionTask: handlers.updateDescription
}));
vi.mock("../model/database/Flights", () => ({ Flights: {} }));
vi.mock("../model/database/Pilots", () => ({ Pilots: {} }));
vi.mock("../tasks/trigger", () => ({ default: vi.fn(), RECHECK_DELAY_SEC: 900 }));

import { executeMonitoredTask } from "../tasks/monitoredTaskExecutor";
import { handleStravaEvent } from "../webhooks/handleStravaEvent";

const task = { name: "FetchAllActivities", pilotId: 42 } as any;

function slackTexts(fetchMock: ReturnType<typeof vi.fn>): string[] {
    return fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).text);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SLACK_EVENTS_WEBHOOK_URL", "https://hooks.slack.test/x");
    db.taskCreate.mockResolvedValue([{ id: "exec-1" }, undefined]);
    db.webhookCreate.mockResolvedValue([{ id: "wh-1" }, undefined]);
    db.pilotGet.mockResolvedValue([{ id: 42 }, undefined]);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe("executeMonitoredTask", () => {
    it("posts one message when the task returns success: false", async () => {
        handlers.FetchAllActivities.mockResolvedValue({ success: false, message: "Strava 429" });

        const result = await executeMonitoredTask(task, { retryCount: 2 });

        expect(result).toEqual({ success: false, message: "Strava 429" });
        expect(slackTexts(fetchMock)).toHaveLength(1);
        expect(slackTexts(fetchMock)[0]).toContain(":x: Task FetchAllActivities failed (retry 2)");
        expect(slackTexts(fetchMock)[0]).toContain("Strava 429");
    });

    it("posts one message when the task throws", async () => {
        handlers.FetchAllActivities.mockRejectedValue(new Error("boom"));

        const result = await executeMonitoredTask(task);

        expect(result).toEqual({ success: false, message: "boom" });
        expect(slackTexts(fetchMock)).toHaveLength(1);
        expect(slackTexts(fetchMock)[0]).toContain(":x: Task FetchAllActivities failed\n");
    });

    it("posts nothing for a first-time success", async () => {
        handlers.FetchAllActivities.mockResolvedValue({ success: true });

        await executeMonitoredTask(task);

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("posts one recovered message when a retry succeeds", async () => {
        handlers.FetchAllActivities.mockResolvedValue({ success: true });

        const result = await executeMonitoredTask(task, { executionId: "exec-9", retryCount: 1 });

        expect(result).toEqual({ success: true });
        expect(slackTexts(fetchMock)).toEqual([
            expect.stringContaining(":white_check_mark: Task FetchAllActivities recovered on retry 1")
        ]);
    });

    it("posts nothing when the URL is unset", async () => {
        vi.stubEnv("SLACK_EVENTS_WEBHOOK_URL", "");
        handlers.FetchAllActivities.mockRejectedValue(new Error("boom"));

        const result = await executeMonitoredTask(task);

        expect(result).toEqual({ success: false, message: "boom" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns the same result when Slack fails", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        handlers.FetchAllActivities.mockResolvedValue({ success: false, message: "Strava 429" });

        const result = await executeMonitoredTask(task);

        expect(result).toEqual({ success: false, message: "Strava 429" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("handleStravaEvent", () => {
    const payload = {
        object_type: "activity",
        object_id: 987,
        aspect_type: "create",
        owner_id: 42
    };

    function response() {
        const res: any = {};
        res.status = vi.fn(() => res);
        res.json = vi.fn(() => res);
        return res;
    }

    function lastWebhookStatus(): string {
        return db.webhookUpdateStatus.mock.calls.at(-1)![2].status;
    }

    it("posts one message when processing fails, without changing status or response", async () => {
        fetchMock.mockResolvedValue(new Response("no_service", { status: 404 }));
        handlers.updateSingleActivity.mockResolvedValue({ success: false, message: "Strava 500" });
        const res = response();

        await handleStravaEvent({ body: payload } as any, res);

        expect(lastWebhookStatus()).toBe("failed");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(slackTexts(fetchMock)).toHaveLength(1);
        expect(slackTexts(fetchMock)[0]).toContain(":x: Webhook activity create failed (activity 987)");
        expect(slackTexts(fetchMock)[0]).toContain("*Webhook event:* wh-1");
    });

    it("posts nothing for an ignored event", async () => {
        db.pilotGet.mockResolvedValue([undefined, "not found"]);
        const res = response();

        await handleStravaEvent({ body: payload } as any, res);

        expect(lastWebhookStatus()).toBe("ignored");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
