import "@styles/globals.css";
import styles from '@styles/Layout.module.css';
import Header from "@ui/Header";
import Breadcrumb from "@ui/Breadcrumb";
import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";

export const metadata: Metadata = createMetadata()

// Every route is already dynamic at runtime: Header calls Auth.checkIsAuthed(),
// which awaits cookies(), and that bails the whole tree out of static rendering.
// Declaring it explicitly changes no runtime behaviour but stops Next attempting
// a static render at build time — during which /flights, /pilots and /sites each
// query the database before reaching any dynamic API. That is the only reason
// the production image build needed DATABASE_* credentials, which in turn is why
// it could not run anywhere but an IP-allowlisted developer machine.
export const dynamic = 'force-dynamic'


export default function Layout({children}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
        <body className={styles.body}>
        <Header/>
        <Breadcrumb/>
        <div className={styles.container}>
            {children}
        </div>
        <footer className={styles.footer}>
            <a href="https://theo.dev">
                Built by theo.dev
            </a>
        </footer>
        </body>
        </html>
    )
}