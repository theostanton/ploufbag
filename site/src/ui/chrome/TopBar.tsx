import Link from 'next/link'
import { Auth } from '@auth/index'
import { Activities, isSuccess } from '@ploufbag/common'
import { getCount } from '@database/pilots'
import { signupState } from '@model/signup'
import { SignOut } from '@ui/SignOut'
import ConnectWithStrava from '@ui/ConnectWithStrava'
import { BRAND_NAME } from '@ui/brand'
import styles from './TopBar.module.css'

type NavItem = { text: string; path: string; authedOnly?: true; badge?: number }

/**
 * The floating navigation bar over the map.
 *
 * There is no Login link. Everything worth seeing here — every flight, every
 * site, every pilot — is public, so by the time someone is looking at the nav
 * they have already seen the product. What they need next is a way to connect
 * their own Strava account, not a way to sign in to an account they do not have
 * yet. Signing in is a thing you do *after* connecting, and /connect handles
 * returning users too, so the button covers both.
 *
 * /login remains as a route: middleware.ts redirects there for /dashboard and
 * /welcome. It is unlinked, not removed.
 *
 * Every link is a next/link. The header this replaced used raw <a href>, which
 * is a full document reload — harmless when each page built its own map, fatal
 * now that the design rests on one instance outliving navigation.
 */
export default async function TopBar() {
    const isAuthed = await Auth.checkIsAuthed()

    // Only asked when there is a button to gate. The signed-in case is the one
    // that renders on every authenticated page view, and it costs no query.
    const signup = isAuthed
        ? null
        : signupState(
              await getCount().catch((error) => {
                  // Fail open, matching /, /login and /connect: a database blip
                  // should not hide the only way in. Strava enforces the real
                  // athlete cap regardless.
                  console.error('TopBar: pilot count failed, showing signup anyway:', error)
                  return 0
              })
          )

    // How many activities are waiting on a decision. Only asked for a signed-in
    // pilot, and never allowed to break the nav: a badge is worth a query, not
    // worth a blank header.
    let waiting = 0
    if (isAuthed) {
        try {
            const pilotId = await Auth.getSelfPilotId()
            const counts = await Activities.countsForPilot(pilotId)
            if (isSuccess(counts)) {
                waiting = counts[0].unsure
            }
        } catch (error) {
            console.error('TopBar: could not count waiting activities:', error)
        }
    }

    const navItems: NavItem[] = [
        { text: 'Flights', path: '/flights' },
        { text: 'Sites', path: '/sites' },
        { text: 'Pilots', path: '/pilots' },
        { text: 'Dashboard', path: '/dashboard', authedOnly: true },
        { text: 'Activities', path: '/activities', authedOnly: true, badge: waiting },
    ]

    return (
        <header className={styles.bar}>
            <Link href="/" className={styles.brand}>
                <span aria-hidden="true">🪂</span>
                <span className={styles.brandName}>{BRAND_NAME}</span>
            </Link>

            <nav className={styles.nav} aria-label="Primary">
                {navItems
                    .filter((item) => !item.authedOnly || isAuthed)
                    .map((item) => (
                        <Link key={item.text} href={item.path} className={styles.navItem}>
                            {item.text}
                            {/* A count, not a dot: "17" is a decision about how
                                long this will take, and a dot is not. */}
                            {item.badge ? (
                                <span className={styles.badge}>{item.badge}</span>
                            ) : null}
                        </Link>
                    ))}
            </nav>

            <div className={styles.actions}>
                {isAuthed && <SignOut />}
                {/* Hidden at capacity rather than shown disabled: Strava rejects
                    the authorize request itself, so the button would bounce
                    through /connect and land back on the home page. */}
                {signup?.isOpen && (
                    <ConnectWithStrava from="header" compact label="Connect Strava" />
                )}
            </div>
        </header>
    )
}
