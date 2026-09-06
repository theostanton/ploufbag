-- Give flights.description the `not null` that create_flights.sql has always
-- declared, on the instances that never got it.
--
-- create_flights.sql opens `create table if not exists`, which is what makes it
-- safe to re-apply -- and also what makes it silent. An instance whose flights
-- table predates that file keeps whatever shape it was given by hand, and the
-- production one was given a nullable description. Every reader has assumed
-- otherwise ever since: `FlightRow.description` is typed `string`, and the
-- description writer calls `.includes` and `.replace` straight on it.
--
-- One NULL row was enough. `isFormattedDescription(flight.description)` threw
-- `Cannot read properties of null (reading 'includes')` out of the middle of a
-- promotion batch, which aborted the whole FetchAllActivities run and returned a
-- 500 to the sync workflow -- so a backfill of twenty flights imported none of
-- them and reported nothing about why.
--
-- The readers are guarded now, so this is not what stops the crash; it is what
-- stops the lie. A column the whole codebase treats as a string should be one.
--
-- An empty description is the honest value for the rows being fixed: it is what
-- promoteFlights already stores for an activity the pilot wrote nothing on, and
-- what the description writer produces for one.
update flights
set description = ''
where description is null;;;

-- Separate statement, and after the backfill: the constraint is validated
-- against the table as it stands, so it has to run second. Guarded because it
-- is applied on every deploy and is already true on every fresh instance.
do
$$
    begin
        if exists (select 1
                   from information_schema.columns
                   where table_name = 'flights'
                     and column_name = 'description'
                     and is_nullable = 'YES') then
            alter table flights alter column description set not null;
        end if;
    end
$$;;;
