-- Adds flights.slug, the short handle behind ploufbag.com/<slug>.
--
-- Apply to existing database instances. create_flights.sql carries the same
-- definitions for fresh instances and for the Testcontainers suite; keep the
-- two in step.
--
-- Safe to re-run: every statement is guarded, and the backfill only touches
-- rows that have no slug yet.

alter table flights
    add column if not exists slug text;

-- See create_flights.sql for why this is random rather than derived from
-- strava_activity_id, and why the unique constraint below is the real guarantee.
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
$slug$ language plpgsql volatile;

alter table flights
    alter column slug set default generate_flight_slug();

-- Backfilled one row at a time on purpose.
--
-- The set-based form -- `update flights set slug = generate_flight_slug()
-- where slug is null` -- does in fact work under READ COMMITTED: the function
-- is volatile, so each call takes a fresh snapshot and its `not exists` check
-- sees the slugs the same statement assigned to earlier rows. Measured on
-- PostgreSQL 14 by backfilling 4 rows out of a deliberately 4-symbol slug
-- space: all-distinct in 100/100 trials, where a stale snapshot would give
-- roughly 9/100.
--
-- That guarantee is isolation-level dependent, though. Under REPEATABLE READ
-- or SERIALIZABLE the function reuses the fixed transaction snapshot, stops
-- seeing the in-flight statement's own writes, and can hand out duplicates.
-- Looping keeps each assignment in its own statement, which is correct at every
-- isolation level -- including when someone pastes this file inside an explicit
-- BEGIN. It costs nothing at these row counts.
do
$backfill$
    declare
        flight record;
    begin
        for flight in select strava_activity_id from flights where slug is null
            loop
                update flights
                set slug = generate_flight_slug()
                where strava_activity_id = flight.strava_activity_id;
            end loop;
    end;
$backfill$;

alter table flights
    alter column slug set not null;

-- Unique rather than merely indexed: /<slug> resolves to exactly one flight,
-- and a duplicate would make a published Strava link ambiguous.
create unique index if not exists flights_slug_key on flights (slug);
