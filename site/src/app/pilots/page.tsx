import {getAll} from "@database/pilots";
import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import MapScene from "@ui/map/MapScene";
import PilotRow from "@ui/chrome/PilotRow";
import {PanelEmpty, PanelHeader, PanelSection} from "@ui/chrome/Panel";

export const metadata: Metadata = createMetadata('Pilots')

/**
 * Everyone flying.
 *
 * A pilot list has nothing of its own to put on the map, so the scene stays
 * empty and the map keeps showing the whole world of flights behind the panel —
 * which is more useful than blanking it, and is the point of having one map.
 */
export default async function PilotsPage() {
    const [pilots, errorMessage] = await getAll();

    return (
        <>
            <MapScene chrome="sheet"/>
            <PanelHeader
                title="Pilots"
                subtitle={pilots ? `${pilots.length} flying with Plouf Bag.` : undefined}
            />
            {pilots
                ? (
                    <PanelSection>
                        {pilots.map(pilot => <PilotRow key={pilot.pilot_id} pilot={pilot}/>)}
                        {pilots.length === 0 && (
                            <PanelEmpty
                                title="No pilots yet"
                                detail="Be the first to connect a Strava account."
                            />
                        )}
                    </PanelSection>
                )
                : <PanelEmpty title="Could not load pilots" detail={errorMessage}/>}
        </>
    );
}
