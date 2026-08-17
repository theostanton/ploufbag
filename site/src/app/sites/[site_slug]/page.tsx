import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import {notFound} from "next/navigation";
import {Sites} from "@database/Sites";
import {Flights} from "@database/flights";
import MapScene from "@ui/map/MapScene";
import {siteRole, siteRoleColor} from "@ui/map/siteRole";
import FlightRow from "@ui/chrome/FlightRow";
import {PanelFacts, PanelHeader, PanelSection} from "@ui/chrome/Panel";
import {formatSiteName} from "@utils/formatSiteName";

export const metadata: Metadata = createMetadata("Site")

/**
 * One site.
 *
 * The scene emphasises the site and every flight that touches it, and asks for
 * the site's polygon — the outline of the landing field or takeoff, which the
 * schema has always carried and nothing has ever drawn. Naming the flights as
 * well as the site is what makes the camera frame the flying rather than
 * zooming to a single pin.
 */
export default async function SiteDetail({params}: {
    params: Promise<{ site_slug: string }>
}) {
    const slug = (await params).site_slug;
    const [site] = await Sites.getForSlug(slug);

    // A real 404 for a slug that does not exist -- see the note in the flight
    // route.
    if (!site) {
        notFound();
    }

    const [siteFlights] = await Flights.getForSite(site.ffvl_sid);
    const flights = siteFlights ?? [];

    const takeoffs = flights.filter(flight => flight.takeoff?.ffvl_sid === site.ffvl_sid).length;
    const landings = flights.filter(flight => flight.landing?.ffvl_sid === site.ffvl_sid).length;

    const accent = siteRoleColor(siteRole(takeoffs, landings, site.type));

    return (
        <>
            <MapScene
                chrome="sheet"
                emphasis={{
                    sites: [site.ffvl_sid],
                    flights: flights.map(flight => String(flight.strava_activity_id)),
                    dimOthers: true,
                }}
                focusSitePolygon={site.ffvl_sid}
            />

            <PanelHeader
                back={{href: '/sites', label: 'All sites'}}
                accent={accent}
                title={formatSiteName(site.name)}
                subtitle={`${site.alt}m · ${flights.length} ${flights.length === 1 ? 'flight' : 'flights'}`}
            />


            <PanelSection>
                <PanelFacts
                    facts={[
                        {label: 'Altitude', value: `${site.alt}m`},
                        {label: 'Flights', value: flights.length},
                        {label: 'Taken off from', value: takeoffs},
                        {label: 'Landed at', value: landings},
                    ]}
                />
            </PanelSection>

            {flights.length > 0 && (
                <PanelSection title="Flights here">
                    {flights.map(flight => (
                        <FlightRow key={flight.strava_activity_id} flight={flight}/>
                    ))}
                </PanelSection>
            )}
        </>
    );
}
