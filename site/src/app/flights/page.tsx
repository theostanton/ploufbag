import {Flights} from "@database/flights";
import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import MapScene from "@ui/map/MapScene";
import FlightRow from "@ui/chrome/FlightRow";
import {PanelEmpty, PanelHeader, PanelSection} from "@ui/chrome/Panel";

export const metadata: Metadata = createMetadata('Flights')

/**
 * Every flight, on the map and in the panel beside it.
 *
 * There is no <FlightsMap> here any more. The map already holds every flight —
 * it loads /api/geo/flights once — so this route only has to say "show all of
 * it, nothing emphasised", which is what the empty scene below means. The camera
 * frames the whole collection.
 *
 * The list is the full set rather than the previous first-twenty, because the
 * list and the map now describe the same thing and it was odd for the map to
 * show a flight the list denied existed.
 */
export default async function FlightsPage() {
    const [flights, errorMessage] = await Flights.getAllSummaries();

    return (
        <>
            <MapScene chrome="sheet"/>
            <PanelHeader
                title="Flights"
                subtitle={
                    flights
                        ? `${flights.length} tracked flights. Pick one here or on the map.`
                        : undefined
                }
            />
            {flights ? (
                <PanelSection title={`${flights.length} flights`}>
                    {flights.map(flight => (
                        <FlightRow key={flight.strava_activity_id} flight={flight}/>
                    ))}
                </PanelSection>
            ) : (
                <PanelEmpty title="Could not load flights" detail={errorMessage}/>
            )}
        </>
    );
}
