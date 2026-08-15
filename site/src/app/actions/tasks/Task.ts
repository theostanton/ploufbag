import {StravaActivityId} from "@ploufbag/common";

export type TaskBody = WingActivityTask

export type WingActivityTask = {
    name: "WingActivity";
    flightId: StravaActivityId
}