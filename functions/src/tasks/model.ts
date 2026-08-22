import { executeFetchAllActivitiesTask } from "./fetchAllActivities";
import { executeUpdateDescriptionTask } from "./updateDescription";
import { executeUpdateSingleActivityTask } from "./updateSingleActivity";
import { executeReconcileDescriptionTask } from "./reconcileDescription";
import { executeHelloWorldTask } from "./helloWorld";
import { executeSyncSitesTask } from "./syncSites";
import { FetchAllActivitiesTask, UpdateDescriptionTask, UpdateSingleActivityTask, ReconcileDescriptionTask, HelloWorldTask, SyncSitesTask } from "@ploufbag/common";

export type TaskResult = TaskSuccess | TaskFailure

export type TaskSuccess = {
    success: true
}

export type TaskFailure = {
    success: false
    message: string
}

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