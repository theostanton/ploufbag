import {getAllWithActivity} from "@database/pilots";
import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import MapScene from "@ui/map/MapScene";
import PilotsPanel from "@ui/chrome/PilotsPanel";
import {PanelEmpty, PanelHeader} from "@ui/chrome/Panel";

export const metadata: Metadata = createMetadata('Pilots')

/**
 * Everyone flying.
 *
 * A pilot list has nothing of its own to put on the map, so the scene stays
 * empty and the map keeps showing the whole world of flights behind the panel —
 * which is more useful than blanking it, and is the point of having one map.
 */
export default async function PilotsPage() {
    const [pilots, errorMessage] = await getAllWithActivity();

    return (
        <>
            <MapScene chrome="sheet"/>
            <PanelHeader
                title="Pilots"
                subtitle={pilots ? `${pilots.length} flying with Plouf Bag.` : undefined}
            />
            {pilots
                ? (pilots.length > 0
                    ? <PilotsPanel pilots={pilots}/>
                    : <PanelEmpty
                        title="No pilots yet"
                        detail="Be the first to connect a Strava account."
                    />)
                : <PanelEmpty title="Could not load pilots" detail={errorMessage}/>}
        </>
    );
}
