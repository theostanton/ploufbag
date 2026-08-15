-- Analytics events: how many people land on the site, and how many of them
-- start a Strava signup.
--
-- event_type is VARCHAR + CHECK rather than a Postgres ENUM, deliberately.
-- ts-postgres cannot decode custom enum OIDs, which is why the monitoring
-- tables had to be rebuilt once already -- see
-- migrate_monitoring_tables_to_varchar.sql. An enum here would insert fine and
-- fail on read.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS analytics_events
(
    id          UUID PRIMARY KEY                  DEFAULT uuid_generate_v4(),

    -- 'landing'      = a request for the home page. The Strava description
    --                  footer is a bare domain with no path, so a click from
    --                  Strava is indistinguishable from any other visit to '/';
    --                  with no other inbound channel, this is the description
    --                  click proxy. If the footer ever gains a tracked path,
    --                  add a distinct event type rather than reinterpreting
    --                  this one -- historical rows would not mean the same thing.
    -- 'signup_click' = pressed "Connect with Strava", i.e. attempted a signup.
    --                  Recorded even when we are at capacity, because a click
    --                  we had to turn away is the demand signal worth having.
    event_type  VARCHAR(32)              NOT NULL CHECK (event_type IN ('landing', 'signup_click')),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Salted hash of IP + user agent, rotated daily. Enough to count uniques
    -- for a day; not enough to identify or track anyone across days, and no raw
    -- IP is stored. NULL when the hash could not be computed.
    visitor_id  VARCHAR(64),

    path        VARCHAR(255),
    referrer    TEXT,
    user_agent  TEXT,

    -- Crawlers reach '/' constantly and would otherwise dwarf real traffic.
    -- Stored rather than dropped so the classifier can be revised later against
    -- the raw rows.
    is_bot      BOOLEAN                  NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at ON analytics_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events (event_type);
-- Serves the headline summary query, which always filters humans within a window.
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_occurred_human ON analytics_events (event_type, occurred_at DESC) WHERE is_bot = FALSE;
