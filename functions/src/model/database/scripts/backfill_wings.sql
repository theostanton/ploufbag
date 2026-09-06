-- Turns the free text already in flights.wing into rows in wings, and links
-- every flight to the row it produced.
--
-- In the manifest, after create_wings.sql, so the deploy applies it. migrate.sh
-- records a checksum, so it runs on the deploy that adds it and again only when
-- this file changes -- but it is written to survive re-application either way:
-- the insert defers to the unique index, the link only touches flights that are
-- not linked yet, and the normalisation only writes rows whose text already
-- disagrees with the wing they point at.
--
-- It was excluded from the manifest as a data backfill and, being excluded, was
-- never applied to production at all -- so `wings` stayed empty there, wing
-- resolution had nothing to resolve against, and every flight naming a glider
-- imported unattributed. An idempotent aggregate over a few hundred rows is a
-- far smaller risk than a table the product depends on being empty in
-- production and full everywhere else. The manifest's note on data backfills
-- says why this one is the exception.
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
      -- The display name has its *internal* whitespace collapsed, not merely
      -- its ends trimmed, so that it agrees with wing_key -- which folds all of
      -- it -- and with normaliseWingName in the TypeScript, which is what the
      -- import path stores. Otherwise "Zeno  2" survives as the display name of
      -- a wing whose key is "zeno2", and the next import writes "Zeno 2" over
      -- it. Same folding, one spelling.
      from (select pilot_id,
                   wing_key(wing)                          as canonical,
                   regexp_replace(trim(wing), '\s+', ' ', 'g') as display,
                   wing                                    as raw,
                   count(*)                                as flights
            from flights
            where wing is not null
              and trim(wing) <> ''
            group by pilot_id, wing_key(wing),
                     regexp_replace(trim(wing), '\s+', ' ', 'g'), wing) as variants) as chosen
where chosen.variant_rank = 1
on conflict (pilot_id, wing_key(name)) do nothing;;;

update flights f
set wing_id = w.wing_id
from wings w
where w.pilot_id = f.pilot_id
  and wing_key(w.name) = wing_key(f.wing)
  and f.wing is not null
  and f.wing_id is null;;;

-- And put the wing's one spelling back onto the flights that point at it.
--
-- flights.wing is not decoration. It is what DescriptionFormatter publishes to
-- Strava, what the per-wing pages route on, and what the map hashes to pick a
-- track colour -- so a flight carrying "ronin      ", captured verbatim from a
-- padded aggregate column, is drawn in a different colour from the rest of that
-- glider's flights and links to a per-wing page holding only itself. Production
-- has several: "ronin      ", "ronin          ", "susi     ".
--
-- Every other write already keeps the two in step (Wings.update, Wings.merge,
-- Flights.setWing); this is the one place that never had the chance to, because
-- these rows predate the wings table. `is distinct from` so a re-run touches
-- nothing, and it is an UPDATE of text the row already means -- no flight
-- changes which glider it is attributed to here.
update flights f
set wing = w.name
from wings w
where w.wing_id = f.wing_id
  and f.wing is distinct from w.name
