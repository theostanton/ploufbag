import {createHash} from "crypto";
import {withPooledClient} from "@database/client";
import {isBotUserAgent} from "@utils/isBot";

export type AnalyticsEventType = 'landing' | 'signup_click';

/**
 * A request's headers, narrowed to what we read. Both `headers()` from
 * next/headers (server components) and `request.headers` (route handlers)
 * satisfy this, so one recorder serves both.
 */
export type HeaderReader = { get(name: string): string | null };

export type AnalyticsSummary = {
    period_hours: number;
    /** Home page views, excluding anything classified as a bot. */
    landings: number;
    unique_landings: number;
    /** "Connect with Strava" presses, including any turned away at capacity. */
    signup_clicks: number;
    unique_signup_clicks: number;
    /** Pilots whose created_at falls in the window. NULL created_at predates the column. */
    signups_completed: number;
    /** All pilots ever, i.e. the number the capacity gate compares against. */
    pilots_total: number;
    bot_landings: number;
};

/**
 * Daily-rotating pseudonymous visitor id.
 *
 * We want "how many people", not "how many requests", but we do not want to
 * store IP addresses. Hashing IP + user agent with a per-day salt gives a token
 * that dedupes within a day and is useless for following anyone across days.
 *
 * SESSION_SECRET is reused as the salt purely because the site already has it;
 * if it is unset the hash is still computed, it is just not secret -- which is
 * acceptable for a counter, and better than dropping the row.
 */
function visitorIdFor(headers: HeaderReader, now: Date): string {
    const forwardedFor = headers.get('x-forwarded-for');
    // Cloud Run appends its own hops; the client is the first entry.
    const ip = forwardedFor?.split(',')[0]?.trim()
        || headers.get('x-real-ip')
        || 'unknown';
    const userAgent = headers.get('user-agent') || 'unknown';
    const day = now.toISOString().slice(0, 10);
    const salt = process.env.SESSION_SECRET || 'ploufbag-analytics';

    return createHash('sha256')
        .update(`${ip}|${userAgent}|${day}|${salt}`)
        .digest('hex')
        .slice(0, 64);
}

/**
 * Records one event. Never throws.
 *
 * Analytics is strictly a side observation of a page render -- a failed insert,
 * an unmigrated database, or a slow pool must never be the reason a visitor
 * sees an error instead of the signup button. Failures are logged and swallowed.
 */
export async function recordEvent(
    eventType: AnalyticsEventType,
    path: string,
    headers: HeaderReader,
): Promise<void> {
    try {
        const userAgent = headers.get('user-agent');
        const now = new Date();

        await withPooledClient(async (database) => {
            await database.query(`
                insert into analytics_events (event_type, visitor_id, path, referrer, user_agent, is_bot)
                values ($1, $2, $3, $4, $5, $6)
            `, [
                eventType,
                visitorIdFor(headers, now),
                path.slice(0, 255),
                headers.get('referer'),
                userAgent,
                isBotUserAgent(userAgent),
            ]);
        });
    } catch (error) {
        console.error(`recordEvent(${eventType}) failed, continuing:`, error);
    }
}

/**
 * The funnel over a window: landings -> signup clicks -> completed signups.
 *
 * `periodHours` is passed as a bind parameter into make_interval rather than
 * interpolated into the SQL string.
 */
export async function getAnalyticsSummary(periodHours: number): Promise<AnalyticsSummary> {
    return withPooledClient(async (database) => {
        type EventCounts = {
            landings: number;
            unique_landings: number;
            signup_clicks: number;
            unique_signup_clicks: number;
            bot_landings: number;
        };

        const events = await database.query<EventCounts>(`
            select count(1) filter (where event_type = 'landing' and not is_bot)::int                       as landings,
                   count(distinct visitor_id) filter (where event_type = 'landing' and not is_bot)::int     as unique_landings,
                   count(1) filter (where event_type = 'signup_click' and not is_bot)::int                  as signup_clicks,
                   count(distinct visitor_id) filter (where event_type = 'signup_click' and not is_bot)::int as unique_signup_clicks,
                   count(1) filter (where event_type = 'landing' and is_bot)::int                           as bot_landings
            from analytics_events
            where occurred_at > now() - make_interval(hours => $1::int)
        `, [periodHours]);

        type PilotCounts = {
            signups_completed: number;
            pilots_total: number;
        };

        const pilots = await database.query<PilotCounts>(`
            select count(1) filter (where created_at > now() - make_interval(hours => $1::int))::int as signups_completed,
                   count(1)::int                                                               as pilots_total
            from pilots
        `, [periodHours]);

        return {
            period_hours: periodHours,
            ...events.rows[0].reify(),
            ...pilots.rows[0].reify(),
        };
    });
}
