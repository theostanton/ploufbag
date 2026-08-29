-- Whether we have read this activity's description, and when.
--
-- A verdict used to be reached once, from the summary Strava's list endpoint
-- gave us, and never revisited. That is the wrong shape for how pilots actually
-- upload: the vario or the phone creates the activity, and the title, the
-- description and the crop arrive minutes or hours later. Strava raises no
-- webhook for most of those edits, so an activity that became recognisable
-- after we looked at it stayed unrecognised for ever -- including one carrying
-- the 🪂 line, which is the strongest signal we have.
--
-- Null means "never read the description", which is the state every existing
-- row starts in and the state an edit puts a row back into: `upsertScanned`
-- clears this column whenever the summary it is handed differs from the one
-- stored, so an activity that changed on Strava gets looked at again.
alter table activities
    add column if not exists description_checked_at timestamp with time zone;;;

-- The review pass asks one question -- "which of this pilot's activities have I
-- not read a description for?" -- and it asks it on every scan.
create index if not exists activities_description_unchecked_idx
    on activities (pilot_id, start_date desc)
    where description_checked_at is null;;;
