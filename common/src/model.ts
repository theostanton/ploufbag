// ===================================
// UNIFIED RESULT/EITHER TUPLE PATTERN
// ===================================

export type Either<V> = Success<V> | Failure
export type Success<V> = [V, undefined]
export type Failure = [undefined, string]

// Utility constructors
export function success<V>(value: V): Success<V> {
    return [value, undefined]
}

export function failure(message: string): Failure {
    return [undefined, message]
}

// Backward compatibility aliases
export const failed = failure
export const createSuccess = success
export const createFailure = failure

// Type guards
export function isSuccess<V>(either: Either<V>): either is Success<V> {
    return either[1] === undefined
}

export function isFailure<V>(either: Either<V>): either is Failure {
    return either[1] !== undefined
}

// ===================================
// BASE ID TYPES
// ===================================

export type StravaAthleteId = number;
export type StravaActivityId = string;
export type PilotId = StravaAthleteId;
export type FlightId = StravaActivityId;

// ===================================
// GEOMETRIC TYPES
// ===================================

export type LatLng = [lat: number, lng: number]
export type Polyline = LatLng[]

// ===================================
// SITE TYPES
// ===================================

export enum SiteType {
    Landing = "Landing",
    TakeOff = "TakeOff",
}

export type Site = {
    ffvl_sid: string,
    slug: string,
    name: string,
    lat: number,
    lng: number,
    alt: number,
    polygon: Polyline | null
    type: SiteType | null
    nearest_balise_id: string | null
}

export type Windsock = {
    balise_id: string,
    name: string,
    lat: number,
    lng: number,
    alt: number,
}

// ===================================
// PILOT TYPES
// ===================================

export type PilotRow = {
    pilot_id: StravaAthleteId
    first_name: string
    profile_image_url: string | null
}

// UI-friendly pilot type (alias for PilotRow)
export type Pilot = PilotRow

export type PilotRowFull = PilotRow & {
    strava_access_token: string
    strava_refresh_token: string
    strava_expires_at: Date
}

// ===================================
// FLIGHT TYPES
// ===================================

export type FlightRow = {
    pilot_id: StravaAthleteId
    strava_activity_id: StravaActivityId
    wing: string
    duration_sec: number
    distance_meters: number
    start_date: Date
    description: string
    polyline: Polyline
    landing_id: string | undefined
    takeoff_id: string | undefined
    description_preferences_snapshot?: DescriptionPreference
    /**
     * Short public handle, e.g. `a45nz`, behind ploufbag.com/a45nz.
     *
     * Optional because nothing in application code ever supplies one: the column
     * has a database default (generate_flight_slug()) that mints it, so rows read
     * back always carry a slug while rows being written never need to.
     *
     * This type is the one `@ploufbag/common` actually exports — index.ts
     * re-exports ./model, not ./types — so it is the FlightRow that the database
     * layer and every consumer of the package sees. types.ts declares a second,
     * near-identical FlightRow used internally by DescriptionFormatter; both need
     * the field, and they are kept in step by hand.
     */
    slug?: string
}

// UI-friendly flight type with joined site and pilot data
export type FlightWithSites = Omit<FlightRow, 'takeoff_id' | 'landing_id'> & {
    takeoff: Site | null
    landing: Site | null
    pilot: Pilot | null
}

// ===================================
// DESCRIPTION PREFERENCES
// ===================================

export type DescriptionPreference = {
    pilot_id: StravaAthleteId
    include_sites: boolean
    include_wind: boolean
    include_wing_aggregate: boolean
    include_year_aggregate: boolean
    include_all_time_aggregate: boolean
}

// ===================================
// AGGREGATION TYPES
// ===================================

export type AggregationResult = {
    count: number
    total_duration_sec: number
    total_distance_meters: number
}

// ===================================
// WIND/WEATHER TYPES
// ===================================

export enum WindDirection {
    N = "N",
    NE = "NE", 
    E = "E",
    SE = "SE",
    S = "S",
    SW = "SW",
    W = "W",
    NW = "NW"
}

export type WindReport = {
    windKmh: number
    gustKmh: number
    direction: WindDirection
}

// ===================================
// STRAVA API TYPES
// ===================================
//
// export type StravaAthlete = {
//     id: StravaAthleteId
//     firstname: string
//     lastname: string
//     profile: string
//     profile_medium: string
// }
//
// export type StravaActivitySummary = {
//     id: StravaActivityId
//     name: string
//     type: string
//     distance: number
//     elapsed_time: number
//     start_date: string
// }
//
// export type StravaActivity = {
//     id: StravaActivityId
//     name: string
//     type: string
//     distance: number
//     elapsed_time: number
//     start_date: string
//     description: string
//     map: {
//         polyline: string
//     }
// }

// ===================================
// TASK TYPES
// ===================================

export type TaskResult = TaskSuccess | TaskFailure

export type TaskSuccess = {
    success: true
}

export type TaskFailure = {
    success: false
    message: string
}

export interface BaseTask {
    name: string
    [key: string]: any  // Allow additional properties for specific task types
}

export type TaskHandler<T extends BaseTask> = (task: T) => Promise<TaskResult>

// Specific task types
export interface FetchAllActivitiesTask extends BaseTask {
    name: "FetchAllActivities";
    pilotId: StravaAthleteId;
}

export interface UpdateDescriptionTask extends BaseTask {
    name: "UpdateDescription";
    flightId: StravaActivityId;
}

export interface UpdateSingleActivityTask extends BaseTask {
    name: "UpdateSingleActivity";
    pilotId: StravaAthleteId;
    activityId: StravaActivityId;
}

export interface SyncSitesTask extends BaseTask {
    name: "SyncSites";
}

export interface HelloWorldTask extends BaseTask {
    name: "HelloWorld";
}

// Union type of all tasks
export type Task = FetchAllActivitiesTask | UpdateDescriptionTask | UpdateSingleActivityTask | SyncSitesTask | HelloWorldTask;

// General task framework types
export type TaskBody = BaseTask
export type TaskName = "SyncSites" | "FetchAllActivities" | "UpdateDescription" | "UpdateSingleActivity" | "HelloWorld"

// Generic task executor function type (to be implemented by functions package)
export type TaskExecutor = (task: TaskBody) => Promise<TaskResult>
export const executeTask: TaskExecutor = () => {
    throw new Error("executeTask must be implemented by the functions package")
}

// ===================================
// MONITORING TYPES
// ===================================

export enum WebhookEventStatus {
    Pending = "pending",
    Processing = "processing", 
    Completed = "completed",
    Failed = "failed",
    Ignored = "ignored"
}

export enum TaskExecutionStatus {
    Pending = "pending",
    Running = "running",
    Completed = "completed", 
    Failed = "failed",
    Cancelled = "cancelled"
}

export enum WebhookEventType {
    Create = "create",
    Update = "update",
    Delete = "delete"
}

export enum WebhookObjectType {
    Activity = "activity",
    Athlete = "athlete"
}

export type WebhookEventRow = {
    id: string; // UUID
    event_type: WebhookEventType;
    object_type: WebhookObjectType;
    object_id: string; // Strava activity/athlete ID
    pilot_id: StravaAthleteId | null;
    received_at: Date;
    processed_at: Date | null;
    status: WebhookEventStatus;
    error_message: string | null;
    payload: any; // JSONB - full webhook payload
    processing_duration_ms: number | null;
    retry_count: number;
    last_retry_at: Date | null;
}

export type TaskExecutionRow = {
    id: string; // UUID
    task_name: TaskName;
    task_payload: any; // JSONB
    triggered_by: string | null; // description of trigger source
    triggered_by_webhook_id: string | null; // UUID reference
    started_at: Date;
    completed_at: Date | null;
    status: TaskExecutionStatus;
    error_message: string | null;
    execution_duration_ms: number | null;
    pilot_id: StravaAthleteId | null;
    retry_count: number;
    last_retry_at: Date | null;
}

// View types for monitoring dashboard
export type WebhookEventWithTasks = WebhookEventRow & {
    triggered_tasks_count: number;
    completed_tasks_count: number;
    failed_tasks_count: number;
}

export type MonitoringActivity = {
    type: 'webhook' | 'task';
    entity_id: string;
    action: string;
    status: string;
    timestamp: Date;
    pilot_id: StravaAthleteId | null;
    error_message: string | null;
    duration_ms: number | null;
}

// Strava webhook payload types (based on Strava API docs)
export type StravaWebhookEvent = {
    object_type: 'activity' | 'athlete';
    object_id: number;
    aspect_type: 'create' | 'update' | 'delete';
    updates?: {
        title?: string;
        type?: string;
        private?: boolean;
        authorized?: boolean;
    };
    owner_id: number;
    subscription_id: number;
    event_time: number; // Unix timestamp
}