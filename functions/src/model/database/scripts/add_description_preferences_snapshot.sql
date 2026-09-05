-- The description preferences a flight's published text was generated from.
--
-- Guarded, like everything else the manifest applies: the deploy re-applies
-- every script on every run, and this was the one statement in the list that
-- would have raised "column already exists" and relied on migrate.sh choosing
-- to forgive it.
ALTER TABLE flights
    ADD COLUMN IF NOT EXISTS description_preferences_snapshot jsonb;
