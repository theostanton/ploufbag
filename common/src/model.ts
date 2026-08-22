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
    // "Takeoff", not "TakeOff". These are the values of the site_type Postgres
    // enum (create_sites.sql), and the lowercase o is what the column actually
    // accepts. syncSites assigns SiteType.TakeOff straight into Site.type and
    // upserts it, so with the old spelling every takeoff classification was
    // rejected by the database while landings went through fine.
    //
    // Nothing depended on the old string: the comparisons in DescriptionFormatter
    // are enum-to-enum, and no row can be holding "TakeOff" because the enum
    // constraint is what refused it in the first place.
    TakeOff = "Takeoff",
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
// WING TYPES
// ===================================

export type WingId = string

/**
 * A glider, owned by a pilot.
 *
 * Until wings became rows, this was free text on the flight: whatever followed
 * the 🪂 in the Strava description the pilot had typed by hand. That made
 * "Zeno 2" and "zeno2" two different wings, made renaming impossible, and left
 * nothing to attribute a flight to when the description named no wing at all.
 */
export type Wing = {
    wing_id: WingId
    pilot_id: StravaAthleteId
    name: string
    manufacturer: string | null
    model: string | null
    /** Hex, e.g. `#3b82f6`. What this wing's tracks are drawn in on the map. */
    colour: string
    /**
     * The period this wing was flown in, as calendar dates (`YYYY-MM-DD`).
     *
     * Null on either side means no boundary there -- a wing still being flown
     * has no `flown_until`. Used to attribute a flight whose wing is not
     * otherwise known.
     *
     * Strings rather than Dates, and read back through `to_char`, because these
     * are calendar dates and not instants: "I flew it from 1 March" means the
     * first of March wherever the pilot was standing. Round-tripping them
     * through a Date drags in the server's timezone and can move the boundary a
     * day, which silently reassigns the flights either side of it. It is also
     * exactly the format `<input type="date">` reads and writes.
     */
    flown_from: string | null
    flown_until: string | null
    retired: boolean
    sort: number
}

// ===================================
// FLIGHT TYPES
// ===================================

export type FlightRow = {
    pilot_id: StravaAthleteId
    strava_activity_id: StravaActivityId
    /**
     * The wing's name, as text, kept alongside `wing_id`.
     *
     * Nullable since wings became rows: not knowing which wing a flight was on
     * used to destroy the flight, because the column was `not null` and the
     * importer had nowhere to put a flight it could not attribute. An
     * unattributed flight is now a legal state.
     *
     * Every consumer must handle null. DescriptionFormatter is the one that
     * matters -- it builds `🪂 ${wing}` and publishes the result onto the
     * pilot's Strava activity -- and it drops the wing line entirely rather than
     * writing "🪂 null".
     */
    wing: string | null
    /**
     * The wing this flight was flown on, once wings became rows.
     *
     * Optional for the same reason `slug` is: application code writing a flight
     * does not always have one to hand, and rows read back may predate the
     * backfill. `wing` above stays populated in step with it, because
     * DescriptionFormatter and the per-wing pages still read the text.
     */
    wing_id?: WingId | null
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
    /**
     * The wing's own colour, joined from `wings`.
     *
     * Optional because not every query joins it and rows predating the backfill
     * have none. Where it is absent the map falls back to hashing the wing's
     * name, which is what it did before wings had colours of their own.
     */
    wing_colour?: string | null
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