create type description_status as enum ('todo', 'done', 'failed');;;

create table flights
(
    strava_activity_id text                     not null
        constraint activities_pk
            primary key,
    pilot_id           integer                  not null,
    wing               text                     not null,
    duration_sec       integer                  not null,
    distance_meters    integer                  not null,
    start_date         timestamp with time zone not null,
    description        text                     not null,
    polyline           json,
    landing_id         text,
    takeoff_id         text,
    -- Short, opaque handle for the flight, published to Strava as
    -- ploufbag.com/<slug> and resolved back by site/src/app/[slug].
    -- Populated by the default below, never by application code.
    slug               text
);;;

-- Five lowercase-alphanumeric characters: 36^5 = 60,466,176 possible slugs.
-- Random rather than derived from strava_activity_id, because activity ids are
-- ~11 digits and do not fit in five characters under any encoding.
--
-- The loop retries until it finds a slug nobody holds. That read-then-write is
-- not atomic, so two concurrent inserts could still settle on the same slug;
-- the unique constraint below is what actually guarantees uniqueness, and it
-- turns that race into a failed insert rather than two flights sharing a URL.
-- At current volumes the loop exits on its first attempt essentially always.
create or replace function generate_flight_slug() returns text as
$slug$
declare
    alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
    candidate         text;
begin
    loop
        candidate := '';
        for i in 1..5
            loop
                candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
            end loop;
        exit when not exists (select 1 from flights where slug = candidate);
    end loop;
    return candidate;
end;
$slug$ language plpgsql volatile;;;

-- Applied after the function exists, since the default calls it. `not null` is
-- safe here only because the default fills every insert; see
-- add_slug_to_flights.sql for the equivalent applied to a populated table.
alter table flights
    alter column slug set default generate_flight_slug();;;

alter table flights
    alter column slug set not null;;;

-- Unique rather than merely indexed: /<slug> resolves to exactly one flight,
-- and a duplicate would make a published Strava link ambiguous.
create unique index flights_slug_key on flights (slug);
