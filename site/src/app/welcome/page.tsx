import {Auth} from "@auth/index";
import {get} from "@database/pilots";
import {Sites} from "@database/Sites";
import styles from "@styles/Page.module.css";
import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import {BRAND_NAME} from "@ui/brand";
import MapScene from "@ui/map/MapScene";

export const metadata: Metadata = createMetadata('Welcome')

export default async function Welcome() {

    const selfId = await Auth.getSelfPilotId()

    const [pilot, error] = await get(selfId)
    const heroBounds = await Sites.getBusiestBounds()

    if (error) {
        return <div>Failed to get pilot ${error}</div>
    }

    return (
        <>
            <MapScene chrome="glass" ambient bounds={heroBounds ?? undefined}/>
            <div className={styles.page}>
                <h1 className={styles.title}>
                    Welcome to {BRAND_NAME}, {pilot.first_name}
                </h1>
            </div>
        </>
    );
}
