import {notFound} from "next/navigation";
import {Flights} from "@database/flights";
import {StravaActivityId, Wings, isSuccess} from "@ploufbag/common";
import {Auth} from "@auth/index";
import Link from "next/link";
import ViewOnStrava from "@ui/links/ViewOnStrava";
import ClientOnlyDate from "@ui/ClientOnlyDate";
import MapScene from "@ui/map/MapScene";
import {getFlightColor} from "@ui/map/colors";
import {PanelFacts, PanelHeader, PanelSection} from "@ui/chrome/Panel";
import styles from "@ui/chrome/FlightDetail.module.css";
import {formatSiteName} from "@utils/formatSiteName";
import FlightControls from "@ui/activities/FlightControls";

function formatDuration(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}min`;
}

/**
 * One flight.
 *
 * The panel describes it; the map shows it. <MapScene> names the flight and its
 * two sites and asks for everything else to be pushed back — so the track is
 * framed and highlighted while the surrounding flights stay faintly visible
 * around it. Dropping the others entirely would leave the flight floating in an
 * empty world, which tells you nothing about where it happened.
 *
 * There is no per-flight map component any more. Arriving here by clicking the
 * track, by following a link from a list, or cold from a Strava short-link all
 * produce the same view, because all three end at the same scene.
 */
export default async function FlightDetail({params}: {
    params: Promise<{ flight_id: StravaActivityId }>
}) {
    const flightId = (await params).flight_id;
    const [[flight], viewerId] = await Promise.all([
        Flights.get(flightId),
        // This page is public, so the viewer is usually not the pilot. Asked
        // without it being an error to say no.
        Auth.getSelfPilotIdOrNull(),
    ]);

    // notFound() rather than a "not found" panel, so the response is an actual
    // 404. These URLs are published in Strava descriptions and get copied by
    // hand, so wrong ones are reached often and by crawlers; answering 200 with
    // apologetic content tells them the page exists.
    //
    // A database failure does not land here -- withPooledClient rejects, and the
    // error boundary catches it -- so this really does mean "no such flight".
    if (!flight) {
        notFound();
    }

    const siteIds = [flight.takeoff?.ffvl_sid, flight.landing?.ffvl_sid]
        .filter((id): id is string => Boolean(id));

    const isOwner = viewerId != null && Number(viewerId) === Number(flight.pilot_id);
    const wingsResult = isOwner ? await Wings.getForPilot(flight.pilot_id) : null;
    const wings = wingsResult && isSuccess(wingsResult)
        ? wingsResult[0].map(wing => ({
            wing_id: wing.wing_id,
            name: wing.name,
            colour: wing.colour,
            retired: wing.retired,
        }))
        : [];

    return (
        <>
            <MapScene
                chrome="sheet"
                emphasis={{
                    flights: [String(flight.strava_activity_id)],
                    sites: siteIds,
                    dimOthers: true,
                }}
            />

            <PanelHeader
                back={{href: '/flights', label: 'All flights'}}
                accent={getFlightColor(String(flight.pilot_id), flight.wing, flight.wing_colour)}
                // A flight can have no wing: `flights.wing` became nullable so
                // that one we cannot attribute survives rather than being
                // discarded. The panel is still about a flight, so it gets a
                // title either way.
                title={flight.wing?.trim() || 'Flight'}
                subtitle={
                    <>
                        {flight.pilot && (
                            <>
                                <Link href={`/pilots/${flight.pilot.pilot_id}`}>
                                    {flight.pilot.first_name}
                                </Link>
                                {' · '}
                            </>
                        )}
                        <ClientOnlyDate date={flight.start_date} format="date"/>
                    </>
                }
            />


            <PanelSection>
                <PanelFacts
                    facts={[
                        {label: 'Duration', value: formatDuration(flight.duration_sec)},
                        {label: 'Distance', value: `${(flight.distance_meters / 1000).toFixed(1)} km`},
                        {
                            // Along-track average, not a straight line: it is
                            // derived from the same distance the panel shows, so
                            // the two numbers agree.
                            label: 'Avg speed',
                            value: flight.duration_sec > 0
                                ? `${((flight.distance_meters / 1000) / (flight.duration_sec / 3600)).toFixed(1)} km/h`
                                : '—',
                        },
                        {
                            label: 'Started',
                            value: <ClientOnlyDate date={flight.start_date} format="time"/>,
                        },
                        {
                            label: 'Wing',
                            // Plain text when there is no wing, because there is
                            // no per-wing page to link to. Making this the place
                            // a pilot picks the wing is a later change; until
                            // then it says what we know rather than pretending.
                            value: flight.wing ? (
                                <Link
                                    href={`/pilots/${flight.pilot_id}/${encodeURIComponent(flight.wing.toLowerCase())}`}
                                >
                                    {flight.wing}
                                </Link>
                            ) : (
                                'Unknown'
                            ),
                        },
                    ]}
                />
            </PanelSection>

            {isOwner && (
                <PanelSection title="Got this wrong?">
                    <FlightControls
                        flightId={String(flight.strava_activity_id)}
                        wingId={flight.wing_id ?? null}
                        wingName={flight.wing ?? null}
                        wingColour={flight.wing_colour ?? null}
                        wings={wings}
                    />
                </PanelSection>
            )}

            <PanelSection title="Route">
                <div className={styles.route}>
                    <SiteEnd role="Takeoff" icon="↗" site={flight.takeoff}/>
                    <div className={styles.routeArrow} aria-hidden="true">→</div>
                    <SiteEnd role="Landing" icon="↘" site={flight.landing}/>
                </div>
            </PanelSection>

            {flight.description && (
                <PanelSection title="Description">
                    <p className={styles.description}>{flight.description}</p>
                    <ViewOnStrava flightId={flight.strava_activity_id}/>
                </PanelSection>
            )}
        </>
    );
}

function SiteEnd({role, icon, site}: {
    role: string
    icon: string
    site: { slug: string, name: string, alt: number } | null
}) {
    const body = (
        <>
            <span className={styles.endIcon} aria-hidden="true">{icon}</span>
            <span className={styles.endRole}>{role}</span>
            <span className={styles.endName}>{site ? formatSiteName(site.name) : 'Unknown'}</span>
            {site?.alt ? <span className={styles.endAlt}>{site.alt}m</span> : null}
        </>
    );

    // An unmatched takeoff or landing is normal — the import only attaches a
    // site when one is close enough — so the unlinked case is a first-class
    // rendering, not a fallback.
    return site?.slug
        ? <Link href={`/sites/${site.slug}`} className={styles.end}>{body}</Link>
        : <div className={styles.end}>{body}</div>;
}
