import {notFound} from "next/navigation";
import {Flights} from "@database/flights";
import {StravaActivityId} from "@ploufbag/common";
import Link from "next/link";
import ViewOnStrava from "@ui/links/ViewOnStrava";
import ClientOnlyDate from "@ui/ClientOnlyDate";
import SignupBanner from "@ui/SignupBanner";
import MapScene from "@ui/map/MapScene";
import {getFlightColor} from "@ui/map/colors";
import {PanelFacts, PanelHeader, PanelSection} from "@ui/chrome/Panel";
import styles from "@ui/chrome/FlightDetail.module.css";
import {formatSiteName} from "@utils/formatSiteName";

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
    const [flight] = await Flights.get(flightId);

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
                accent={getFlightColor(String(flight.pilot_id), flight.wing || 'unknown')}
                title={flight.wing}
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

            <SignupBanner from="flight"/>

            <PanelSection>
                <PanelFacts
                    facts={[
                        {label: 'Duration', value: formatDuration(flight.duration_sec)},
                        {label: 'Distance', value: `${(flight.distance_meters / 1000).toFixed(1)} km`},
                        {
                            label: 'Started',
                            value: <ClientOnlyDate date={flight.start_date} format="time"/>,
                        },
                        {
                            label: 'Wing',
                            value: (
                                <Link
                                    href={`/pilots/${flight.pilot_id}/${encodeURIComponent(flight.wing.toLowerCase())}`}
                                >
                                    {flight.wing}
                                </Link>
                            ),
                        },
                    ]}
                />
            </PanelSection>

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
