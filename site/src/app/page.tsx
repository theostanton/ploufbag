import Head from "next/head";
import styles from "@styles/Page.module.css";
import {BRAND_NAME} from "@ui/brand";

export default function Home() {
    return (
        <div className={styles.pageCentered}>

            <h1 className={styles.title}>
                Welcome to {BRAND_NAME}.
            </h1>

            <h2 className={styles.subtitle}>Coming soon...</h2>

        </div>
    );
}
