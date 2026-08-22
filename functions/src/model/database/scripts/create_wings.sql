-- Wings as a first-class entity.
--
-- Until now a wing was free text on the flight row, parsed out of the 🪂 line a
-- pilot had typed into their Strava description by hand. "Zeno 2", "zeno2" and
-- "Zeno 2 " were three different wings, none of them could be renamed, and none
-- carried a colour or the dates it was flown between -- so there was nothing to
-- attribute a flight to when the description did not name one.
--
-- Apply to existing instances together with backfill_wings.sql, which turns the
-- free text already in flights.wing into rows here and links every flight.
-- Registered in both Testcontainers loaders (functions
-- generateContainer.test.ts, site src/test/setup.ts) *after* create_flights,
-- because it alters that table.
--
-- Safe to re-run: every statement is guarded.

create table if not exists wings
(
    wing_id      uuid primary key                  default gen_random_uuid(),
    pilot_id     integer                  not null,
    name         text                     not null,
    manufacturer text,
    model        text,
    -- Hex, e.g. '#3b82f6'. Not null because every track has to be drawn in
    -- something, and backfill_wings seeds it with the colour the map was
    -- already deriving from the wing's name -- so no pilot's map changes on the
    -- day this lands.
    colour       text                     not null,
    -- Null means "no boundary on that side": a wing still being flown has no
    -- flown_until, and one bought before the pilot's Strava history begins has
    -- no useful flown_from. A flight whose wing is otherwise unknown is
    -- attributed by finding the single wing whose period contains its date.
    flown_from   date,
    flown_until  date,
    retired      boolean                  not null default false,
    sort         integer                  not null default 0,
    created_at   timestamp with time zone not null default now()
);;;

-- How two spellings are judged to be the same glider.
--
-- Lowercased with *all* whitespace removed, not merely trimmed: pilots type
-- "Zeno 2", "zeno2" and "Zeno  2" for one wing, and only folding the ends would
-- leave the middle two as separate gliders -- which is the free-text problem
-- this table exists to end. The display name keeps its spacing; only the key
-- that decides identity is folded.
--
-- It is a function rather than three copies of the expression because the unique
-- index below, the insert in backfill_wings.sql and the join that links flights
-- must agree exactly; three inline copies is precisely the shape that drifts.
--
-- Immutable, and it has to stay that way: an index is built over it, so changing
-- what it returns silently corrupts that index. Any future edit to the body
-- needs `reindex index wings_pilot_name_key` with it.
create or replace function wing_key(name text) returns text as
$wing_key$
select lower(regexp_replace(coalesce(name, ''), '\s+', '', 'g'))
$wing_key$ language sql immutable;;;

-- One wing per pilot per name. This is the constraint that stops the free-text
-- problem growing back, and backfill_wings relies on it to be re-runnable.
create unique index if not exists wings_pilot_name_key
    on wings (pilot_id, wing_key(name));;;

alter table flights
    add column if not exists wing_id uuid;;;

create index if not exists flights_wing_id_idx on flights (wing_id);;;

-- `on delete set null`, never cascade: deleting a wing must not delete flights.
-- An unattributed flight is a legal state under this design; a deleted one is
-- data loss. Wrapped in a DO block because ADD CONSTRAINT has no IF NOT EXISTS.
do
$wing_fk$
    begin
        if not exists (select 1 from pg_constraint where conname = 'flights_wing_id_fkey') then
            alter table flights
                add constraint flights_wing_id_fkey
                    foreign key (wing_id) references wings (wing_id) on delete set null;
        end if;
    end;
$wing_fk$;;;

-- The consequential line in this file.
--
-- `wing not null` meant a flight could not exist until its wing was known, so
-- failing to work out the wing destroyed the flight rather than leaving it
-- unattributed -- which is exactly what the old importer did, silently, to
-- every activity without a 🪂 line.
--
-- Relaxing it makes "unknown wing" expressible. It also makes it possible to
-- read a null out of this column, and the reader that matters is
-- DescriptionFormatter: it builds the wing line as `🪂 ${wing}`, and publishing
-- "🪂 null" onto somebody's Strava activity is not self-healing (see the
-- incident notes in descriptionFooter.ts for the two previous times a
-- description writer corrupted live activities). Every reader was audited and
-- guarded before this line was written.
alter table flights
    alter column wing drop not null;;;

-- Reproduces getFlightColor() from the site's map code exactly, so that
-- backfill_wings can freeze the colour each wing is *already* being drawn in
-- rather than assigning it a new one.
--
-- The original is a djb2-ish hash over `pilotId + wing` in JavaScript:
--
--     hash = (hash << 5) - hash + charCode, coerced back to int32 each round
--
-- `hash * 31` below looks like a simplification and is in fact exact. In
-- JavaScript `hash << 5` is itself truncated to int32 before the subtraction,
-- so the round is ToInt32(ToInt32(hash * 32) - hash + code). ToInt32(x) is
-- congruent to x modulo 2^32 and is fully determined by that residue, so the
-- whole expression is congruent to hash * 31 + code, and every intermediate
-- stays well inside the exactly-representable range of a double. The two agree
-- for every input; wingColour.test.ts checks that against the TypeScript.
--
-- One documented divergence: ascii() returns a Unicode code point where
-- charCodeAt() returns a UTF-16 code unit, so a wing name containing a
-- character outside the BMP (an emoji) hashes differently here. Wing names come
-- from the capture group *after* the 🪂, so this is rare, cosmetic, and frozen
-- into the row the first time the backfill runs either way.
create or replace function track_colour(key text) returns text as
$colour$
declare
    palette   constant text[] := array [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
        '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
        ];
    hash               bigint := 0;
    char_index         int;
begin
    for char_index in 1..coalesce(length(key), 0)
        loop
            hash := hash * 31 + ascii(substr(key, char_index, 1));
            -- ToInt32: reduce modulo 2^32, then reinterpret the top half as
            -- negative. Postgres's % keeps the sign of the dividend, hence the
            -- first correction.
            hash := hash % 4294967296;
            if hash < 0 then
                hash := hash + 4294967296;
            end if;
            if hash >= 2147483648 then
                hash := hash - 4294967296;
            end if;
        end loop;
    -- Arrays are 1-based here and 0-based there.
    return palette[1 + (abs(hash) % array_length(palette, 1))];
end;
$colour$ language plpgsql immutable
