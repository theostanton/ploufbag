-- Turns the free text already in flights.wing into rows in wings, and links
-- every flight to the row it produced.
--
-- Apply once, after create_wings.sql. Safe to re-run: the insert defers to the
-- unique index and the update only touches flights that are not linked yet.
--
-- Not part of create_wings.sql because the Testcontainers loaders run the schema
-- before seeding any flights, where this would be a no-op -- and a backfill that
-- can never run in the test suite is a backfill nobody has tested.

-- Case- and whitespace-variants of the same name collapse into one wing, which
-- is the point: "Zeno 2", "zeno2" and "Zeno  2 " were four wings and one glider.
-- wing_key() in create_wings.sql decides what counts as the same name, and is
-- the same expression the unique index is built over.
--
-- The colour is taken from the *most-flown* raw variant rather than from the
-- canonical name, because the map keys its hash off the raw string. Whichever
-- spelling a pilot's tracks mostly appear in is the colour they keep; the
-- minority spellings change to match it, which is the only visible effect of
-- this backfill and is the correct one -- one glider, one colour.
insert into wings (pilot_id, name, colour)
select chosen.pilot_id,
       chosen.display,
       track_colour(chosen.pilot_id::text || chosen.raw)
from (select variants.pilot_id,
             variants.display,
             variants.raw,
             row_number() over (
                 partition by variants.pilot_id, variants.canonical
                 order by variants.flights desc, variants.display, variants.raw
                 ) as variant_rank
      from (select pilot_id,
                   wing_key(wing)    as canonical,
                   trim(wing)        as display,
                   wing              as raw,
                   count(*)          as flights
            from flights
            where wing is not null
              and trim(wing) <> ''
            group by pilot_id, wing_key(wing), trim(wing), wing) as variants) as chosen
where chosen.variant_rank = 1
on conflict (pilot_id, wing_key(name)) do nothing;;;

update flights f
set wing_id = w.wing_id
from wings w
where w.pilot_id = f.pilot_id
  and wing_key(w.name) = wing_key(f.wing)
  and f.wing is not null
  and f.wing_id is null
