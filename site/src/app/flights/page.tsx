import {Flights} from "@database/flights";
import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import MapScene from "@ui/map/MapScene";
import FlightsPanel from "@ui/chrome/FlightsPanel";
import {PanelEmpty, PanelHeader} from "@ui/chrome/Panel";
import {standoutThreshold} from "@ploufbag/common/dist/flightList";

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
 *
 * The subtitle says how to read the list, not how long it is: the count lives
 * in the search box, where it changes as you type. The threshold comes from
 * STANDOUT_MIN_SEC, so the sentence cannot drift from the rule it describes.
 *
 * The search is read from `?q=` here, on the server, so a reload or a shared
 * link arrives already filtered rather than flashing the full list first. The
 * panel keeps the URL in step as you type.
 */
export default async function FlightsPage({searchParams}: { searchParams: Promise<{ q?: string | string[] }> }) {
    const [[flights, errorMessage], {q}] = await Promise.all([Flights.getAllSummaries(), searchParams]);
    // `?q=a&q=b` is not something the panel writes; take the first.
    const query = (Array.isArray(q) ? q[0] : q) ?? '';

    return (
        <>
            <MapScene chrome="sheet"/>
            <PanelHeader
                title="Flights"
                subtitle={
                    flights
                        ? `Newest first. Flights of ${standoutThreshold()} or more are marked.`
                        : undefined
                }
            />
            {flights ? (
                <FlightsPanel flights={flights} initialQuery={query}/>
            ) : (
                <PanelEmpty title="Could not load flights" detail={errorMessage}/>
            )}
        </>
    );
}
