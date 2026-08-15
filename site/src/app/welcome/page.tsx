import {Auth} from "@auth/index";
import {get} from "@database/pilots";
import styles from "@styles/Page.module.css";
import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import {BRAND_NAME} from "@ui/brand";

export const metadata: Metadata = createMetadata('Welcome')

export default async function Welcome() {

    const selfId = await Auth.getSelfPilotId()

    const [pilot, error] = await get(selfId)

    if (error) {
        return <div>Failed to get pilot ${error}</div>
    }

    return (
        <div className={styles.page}>
            <h1 className={styles.title}>
                Welcome to {BRAND_NAME}, {pilot.first_name}
            </h1>
        </div>
    );
}
