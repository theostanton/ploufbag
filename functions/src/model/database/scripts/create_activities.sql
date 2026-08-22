-- Every Strava activity a pilot owns, and what we think it is.
--
-- Flights were the only trace of a Strava activity this product had ever seen.
-- Anything that failed to convert was dropped with a line in a log, which means
-- three things were impossible: telling a pilot why their flight is missing,
-- remembering that they had already said something was not a flight, and
-- re-running a scan without asking the same questions again.
--
-- This table is that memory. It holds the summary Strava's list endpoint already
-- returns -- no per-activity fetch -- plus a verdict and the reasons behind it.
--
-- Registered in both Testcontainers loaders and in dev/db.sh. Safe to re-run.

do
$verdict$
    begin
        if not exists (select 1 from pg_type where typname = 'activity_verdict') then
            create type activity_verdict as enum ('flight', 'unsure', 'not_flight');
        end if;
    end;
$verdict$;;;

create table if not exists activities
(
    -- Not `activities_pk`, however natural that reads: create_flights.sql
    -- already uses that name for the *flights* primary key, left over from when
    -- flights were what this product called activities. Index names share one
    -- namespace per schema, so reusing it fails on the very first run.
    strava_activity_id  text                     not null
        constraint activities_strava_activity_id_pk primary key,
    pilot_id            integer                  not null,

    -- The summary, as Strava's list endpoint gives it. Kept so that the
    -- classifier can be re-run, and its thresholds changed, without going back
    -- to Strava for data we already had.
    type                text                     not null,
    name                text                     not null,
    start_date          timestamp with time zone not null,
    distance_meters     integer                  not null,
    elapsed_sec         integer                  not null,
    moving_sec          integer,
    total_elevation_gain real,
    start_lat           double precision,
    start_lng           double precision,
    end_lat             double precision,
    end_lng             double precision,
    -- The simplified track. The map needs geometry for activities that are not
    -- flights yet, and re-deriving it from Strava for every render is not an
    -- option -- deciding "was this a flight?" is a glance at the shape.
    polyline            json,

    -- What the classifier concluded, and the signals that got it there. The
    -- reasons are stored rather than recomputed because they are shown to the
    -- pilot: "left from Planfait, landed at Doussard, 38 min" is what makes a
    -- verdict checkable, and it has to still say that after the thresholds move.
    verdict             activity_verdict         not null,
    score               integer                  not null,
    reasons             json                     not null default '[]'::json,
    takeoff_id          text,
    landing_id          text,

    -- The pilot's own decision, and the reason this table exists.
    --
    -- Always wins over `verdict`, and is never written by a scan. Without it a
    -- re-scan with a better classifier would silently promote back everything
    -- somebody had already rejected, which is the one thing an automated system
    -- that guesses must never do.
    pilot_verdict       activity_verdict,
    decided_at          timestamp with time zone,

    scanned_at          timestamp with time zone not null default now()
);;;

-- The screen filters by verdict, per pilot, most recent first. All three lists
-- (flights, unsure, not flights) are the same query with a different value.
create index if not exists activities_pilot_verdict_idx
    on activities (pilot_id, start_date desc);;;

-- Which Strava activity types this pilot logs flights as.
--
-- Replaces isRelevantActivityType()'s hard-coded 'Workout' and 'Kitesurf',
-- which is why a pilot who logs flights as a Hike saw an empty account forever
-- and was never told why. Null means "not asked yet", which is not the same as
-- an empty list and is what lets the empty state offer the pilot their own most
-- used types rather than a guess.
alter table pilots
    add column if not exists flight_activity_types text[];
