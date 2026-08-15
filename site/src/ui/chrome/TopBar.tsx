import Link from 'next/link'
import { Auth } from '@auth/index'
import { SignOut } from '@ui/SignOut'
import { BRAND_NAME } from '@ui/brand'
import styles from './TopBar.module.css'

enum AuthRequired {
    Authed,
    NotAuthed,
    Always,
}

function shouldShow(authRequired: AuthRequired, isAuthed: boolean): boolean {
    switch (authRequired) {
        case AuthRequired.Authed:
            return isAuthed
        case AuthRequired.NotAuthed:
            return !isAuthed
        case AuthRequired.Always:
            return true
    }
}

type NavItem = {
    auth: AuthRequired
    text: string
    path: string
}

/**
 * The floating navigation bar over the map. Replaces the old document header.
 *
 * Every link here is a next/link. The previous Header used raw <a href>, which
 * is a full document reload -- harmless when each page built its own map, fatal
 * now that the whole design rests on one map instance outliving navigation.
 */
export default async function TopBar() {
    const isAuthed = await Auth.checkIsAuthed()

    const navItems: NavItem[] = [
        { text: 'Flights', path: '/flights', auth: AuthRequired.Always },
        { text: 'Sites', path: '/sites', auth: AuthRequired.Always },
        { text: 'Pilots', path: '/pilots', auth: AuthRequired.Always },
        { text: 'Dashboard', path: '/dashboard', auth: AuthRequired.Authed },
        { text: 'Login', path: '/login', auth: AuthRequired.NotAuthed },
    ]

    return (
        <header className={styles.bar}>
            <Link href="/" className={styles.brand}>
                <span aria-hidden="true">🪂</span>
                <span className={styles.brandName}>{BRAND_NAME}</span>
            </Link>
            <nav className={styles.nav} aria-label="Primary">
                {navItems
                    .filter((item) => shouldShow(item.auth, isAuthed))
                    .map((item) => (
                        <Link key={item.text} href={item.path} className={styles.navItem}>
                            {item.text}
                        </Link>
                    ))}
                {isAuthed && <SignOut />}
            </nav>
        </header>
    )
}
