import { executeFetchAllActivitiesTask } from "./fetchAllActivities";
import { executeUpdateDescriptionTask } from "./updateDescription";
import { executeUpdateSingleActivityTask } from "./updateSingleActivity";
import { executeReconcileDescriptionTask } from "./reconcileDescription";
import { executeHelloWorldTask } from "./helloWorld";
import { executeSyncSitesTask } from "./syncSites";
import { FetchAllActivitiesTask, UpdateDescriptionTask, UpdateSingleActivityTask, ReconcileDescriptionTask, HelloWorldTask, SyncSitesTask } from "@ploufbag/common";

/**
 * Re-exported rather than redeclared.
 *
 * These were a byte-for-byte copy of the same three types in
 * @ploufbag/common, which is fine until one side gains a field -- as
 * TaskSuccess just did, to carry what a task found back to whoever dispatched
 * it. Then the handlers return one shape, the HTTP layer reads another, and the
 * compiler says a property that exists does not.
 */
import type { TaskResult } from "@ploufbag/common"

export type { TaskResult, TaskSuccess, TaskFailure } from "@ploufbag/common"

export type TaskBody = FetchAllActivitiesTask | UpdateDescriptionTask | UpdateSingleActivityTask | ReconcileDescriptionTask | HelloWorldTask | SyncSitesTask

export type TaskHandler = (task: any) => Promise<TaskResult>

export type TaskName = TaskBody['name'];

export const taskHandlers: Record<TaskName, TaskHandler> = {
    SyncSites: executeSyncSitesTask,
    FetchAllActivities: executeFetchAllActivitiesTask,
    UpdateDescription: executeUpdateDescriptionTask,
    UpdateSingleActivity: executeUpdateSingleActivityTask,
    ReconcileDescription: executeReconcileDescriptionTask,
    HelloWorld: executeHelloWorldTask,
}