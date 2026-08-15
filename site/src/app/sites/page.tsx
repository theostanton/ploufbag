import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import {Sites} from "@database/Sites";
import MapScene from "@ui/map/MapScene";
import SitesPanel from "@ui/chrome/SitesPanel";
import {PanelEmpty, PanelHeader} from "@ui/chrome/Panel";

export const metadata: Metadata = createMetadata('Sites')

/**
 * Every flying site.
 *
 * The site markers are always on the map, so this route emphasises nothing and
 * simply lets the camera frame the whole collection. Hovering a row lights up
 * its marker; clicking either the row or the marker opens the site.
 */
export default async function SitesPage() {
    const [sites, errorMessage] = await Sites.getAllWithFlightCounts();

    return (
        <>
            <MapScene chrome="sheet"/>
            <PanelHeader
                title="Flying sites"
                subtitle={sites ? `${sites.length} takeoffs and landings.` : undefined}
            />
            {sites
                ? <SitesPanel sites={sites}/>
                : <PanelEmpty title="Could not load sites" detail={errorMessage}/>}
        </>
    );
}
