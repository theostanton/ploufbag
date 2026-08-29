import {TaskBody, TaskName, failed, Either, success} from "@ploufbag/common";

const {CloudTasksClient} = require('@google-cloud/tasks').v2;

function getQueueId(taskName: TaskName): string | null {
    switch (taskName) {
        case "FetchAllActivities":
            return process.env.QUEUE_ID_FETCH_ACTIVITIES!!
        case "UpdateDescription":
            return process.env.QUEUE_ID_WING_ACTIVITY!!
        case "UpdateSingleActivity":
            return process.env.QUEUE_ID_UPDATE_SINGLE_ACTIVITY!!
        default:
            return null
    }

}

/**
 * How long to wait before looking at a freshly uploaded activity again.
 *
 * Strava raises the create webhook when the activity appears, which is not when
 * the pilot has finished with it: a vario or a watch uploads first and the app
 * sends the title, the description and any crop afterwards, and Strava raises no
 * webhook for most of those. Fifteen minutes is long enough to be after the
 * pilot has packed up and tidied the activity, and short enough that the flight
 * shows up while they are still looking at their phone.
 */
export const RECHECK_DELAY_SEC = 15 * 60

export default async function (
    task: TaskBody,
    options: { delaySec?: number } = {}
): Promise<Either<void>> {
    const client = new CloudTasksClient({
        // Add timeout to fail faster instead of waiting 40+ seconds
        timeout: 10000 // 10 seconds
    })

    try {
        const queueId = getQueueId(task.name as TaskName);
        if (!queueId) {
            return failed(`No queue id found for =${task.name}`)
        }
        const response = await client.createTask({
            parent: queueId,
            task: {
                httpRequest: {
                    headers: {
                        "Content-Type": "application/json"
                    },
                    url: process.env.TASKS_URL,
                    httpMethod: "POST",
                    body: Buffer.from(JSON.stringify(task)).toString('base64')
                },
                // Cloud Tasks holds it until then, so a delayed re-check costs
                // nothing to wait for and survives this container going away.
                ...(options.delaySec
                    ? { scheduleTime: { seconds: Math.round(Date.now() / 1000) + options.delaySec } }
                    : {}),
            }
        })
        console.log(`Triggered task=${task} response=${JSON.stringify(response)}`)
        return success(undefined)
    } catch (err) {
        console.error(`Failed to create Cloud Task:`, err)
        return failed(`Failed to create task body=${JSON.stringify(task)} err=${err}`)
    }
}