import {notFound} from "next/navigation";
import {get} from "@database/pilots";
import {Flights} from "@database/flights";
import MapScene from "@ui/map/MapScene";
import {getFlightColor} from "@ui/map/colors";
import FlightRow from "@ui/chrome/FlightRow";
import {PanelEmpty, PanelHeader, PanelSection} from "@ui/chrome/Panel";

/**
 * One pilot, one wing.
 *
 * This is where colour-by-pilot-and-wing pays off: every track in this view is
 * the same colour, because that colour is derived from exactly this pair. The
 * accent bar in the header is the same value, so the panel and the map are
 * visibly about the same thing.
 */
export default async function PilotWingPage({params}: {
    params: Promise<{ pilot_id: string, wing: string }>
}) {
    const {pilot_id: pilotIdParam, wing: wingParam} = await params
    const pilotId = parseInt(pilotIdParam)
    // Next hands the segment over still percent-encoded (`gin%20bonanza%203`),
    // and every wing name has a space in it, so undecoded it matched nothing.
    const wing = decodeURIComponent(wingParam)

    const [pilot] = await get(pilotId);
    if (!pilot) {
        notFound();
    }

    const [flights, flightsErrorMessage] = await Flights.getForPilotAndWing(pilotId, wing);

    if (!flights) {
        return (
            <>
                <MapScene chrome="sheet"/>
                <PanelHeader
                    title={pilot.first_name}
                    back={{href: `/pilots/${pilotId}`, label: pilot.first_name}}
                />
                <PanelEmpty title="Could not load these flights" detail={flightsErrorMessage}/>
            </>
        );
    }

    // The wing as the pilot spells it, rather than the lowercased URL segment.
    const wingName = flights[0]?.wing ?? wing;

    return (
        <>
            <MapScene
                chrome="sheet"
                emphasis={{
                    flights: flights.map(flight => String(flight.strava_activity_id)),
                    dimOthers: true,
                }}
            />

            <PanelHeader
                back={{href: `/pilots/${pilotId}`, label: pilot.first_name}}
                accent={getFlightColor(String(pilotId), wingName, flights[0]?.wing_colour)}
                title={wingName}
                subtitle={`${pilot.first_name} · ${flights.length} ${flights.length === 1 ? 'flight' : 'flights'}`}
            />

            {flights.length > 0 ? (
                <PanelSection>
                    {flights.map(flight => (
                        <FlightRow key={flight.strava_activity_id} flight={flight} dateStyle="full"/>
                    ))}
                </PanelSection>
            ) : (
                <PanelEmpty title="No flights on this wing yet"/>
            )}
        </>
    );
}
