import "@styles/globals.css";
import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import MapRoot from "@ui/map/MapRoot";
import TopBar from "@ui/chrome/TopBar";
import SignupChrome from "@ui/chrome/SignupChrome";

export const metadata: Metadata = createMetadata()

// Every route is already dynamic at runtime: TopBar calls Auth.checkIsAuthed(),
// which awaits cookies(), and that bails the whole tree out of static rendering.
// Declaring it explicitly changes no runtime behaviour but stops Next attempting
// a static render at build time — during which /flights, /pilots and /sites each
// query the database before reaching any dynamic API. That is the only reason
// the production image build needed DATABASE_* credentials, which in turn is why
// it could not run anywhere but an IP-allowlisted developer machine.
export const dynamic = 'force-dynamic'

/**
 * The whole application is one map with panels floating over it.
 *
 * The layout is the mount point because the App Router never remounts it, so
 * the Mapbox instance inside MapRoot is created once per page load and outlives
 * every navigation. The four map components this replaced each built their own
 * instance and destroyed it on the way out.
 *
 * `children` is a route's panel content, not a page: it renders inside the
 * sheet. There is no document flow to lay out here any more and no footer —
 * nothing scrolls except the panels themselves.
 */
export default function Layout({children}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
        <body>
        <MapRoot topBar={<TopBar/>} signup={<SignupChrome/>}>
            {children}
        </MapRoot>
        </body>
        </html>
    )
}
