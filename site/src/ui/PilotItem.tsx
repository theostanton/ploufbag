import {Pilot} from "@ploufbag/common";
import Link from "next/link";
import styles from "./PilotItem.module.css";

export default function PilotItem({pilot}: { pilot: Pilot }) {
    return <div className={styles.container}>
        <Link href={`/pilots/${pilot.pilot_id}`} className={styles.mainContent}>
            <div className={styles.header}>
                <div className={styles.pilotInfo}>
                    {pilot.profile_image_url ? (
                        <img
                            src={pilot.profile_image_url}
                            alt={pilot.first_name}
                            className={styles.pilotAvatar}
                        />
                    ) : (
                        <div className={styles.pilotAvatarPlaceholder}>
                            <span className={styles.pilotIcon}>👤</span>
                        </div>
                    )}
                    <div className={styles.pilotDetails}>
                        <h3 className={styles.pilotName}>🪂 {pilot.first_name}</h3>
                    </div>
                </div>
                <div className={styles.arrow}>
                    →
                </div>
            </div>
        </Link>
    </div>
}