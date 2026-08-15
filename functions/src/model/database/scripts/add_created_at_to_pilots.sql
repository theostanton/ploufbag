-- Gives pilots a signup timestamp, so completed signups can be reported over
-- the same time window as the landings and signup clicks in analytics_events.
--
-- Deliberately left NULL for existing rows rather than backfilled with NOW().
-- We do not know when those pilots connected, and stamping today's date would
-- make the funnel read as though they all signed up the day this shipped.
-- Queries counting signups in a window therefore see NULL rows as "before the
-- window", which is true of every pilot that predates this column.
--
-- No application change is needed to populate it: handleCode's INSERT does not
-- name created_at, so the default applies on insert, and its ON CONFLICT DO
-- UPDATE branch does not touch it -- a returning pilot re-authorising keeps
-- their original signup date.

ALTER TABLE pilots
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE pilots
    ALTER COLUMN created_at SET DEFAULT NOW();
