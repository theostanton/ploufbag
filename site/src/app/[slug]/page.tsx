import {notFound, redirect} from "next/navigation";
import {SLUG_PATTERN} from "@ploufbag/common";
import {Flights} from "@database/flights";

/**
 * Resolves the short flight URLs stamped onto Strava activity descriptions.
 *
 * ploufbag.com/a45nz -> ploufbag.com/flights/15038284782
 *
 * This sits at the root of the route tree so the published link is as short as
 * it can be. That means it is also the catch-all for every unmatched
 * single-segment path, which is fine in both directions: Next.js resolves
 * static segments before dynamic ones, so /login, /admin, /sites and friends
 * never reach this file, and anything that does reach it and is not slug-shaped
 * falls through to the standard 404.
 *
 * The canonical /flights/<id> URL is unchanged — the slug is a pointer to the
 * flight, not a replacement identity for it.
 *
 * Temporary rather than permanent, which matters: deleting an activity on
 * Strava deletes the flight row (Flights.deleteByActivityId), which frees its
 * slug for generate_flight_slug() to hand to a different flight later. A 308
 * would have been cached by browsers and CDNs against that first flight
 * indefinitely, sending visitors to a stale id that a slug no longer points at.
 */
export default async function ShortFlightLink({params}: {
    params: Promise<{ slug: string }>
}) {
    const {slug} = await params;

    // Checked before touching the database so that arbitrary junk paths cost a
    // regex rather than a connection from the pool.
    if (!SLUG_PATTERN.test(slug)) {
        notFound();
    }

    const [flightId] = await Flights.getIdForSlug(slug);

    if (!flightId) {
        notFound();
    }

    // Outside any try/catch on purpose: next/navigation signals redirects by
    // throwing, so catching around this would swallow the redirect and render
    // an empty page instead.
    redirect(`/flights/${flightId}`);
}
