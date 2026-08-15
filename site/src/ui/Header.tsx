import {Auth} from "@auth/index";
import styles from "@styles/Header.module.css";
import {SignOut} from "@ui/SignOut";
import {BRAND_NAME} from "@ui/brand";


enum AuthRequired {
    Authed, NotAuthed, Always
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

function NavItem(props: { text: string, path: string }) {
    return <a className={styles.navItem} href={props.path}>
        <div className={styles.navText}>{props.text}</div>
    </a>
}

/**
 * The nav is shown on every page, the home page included.
 *
 * It used to be hidden there, from when the home page was a signup wall with
 * nothing behind it to navigate to. Flights, pilots and sites are public now, so
 * hiding the nav on the one page a new visitor is most likely to land on was
 * hiding the site from exactly the person who had not seen it yet.
 */
export default async function Header() {
    const isAuthed = await Auth.checkIsAuthed()

    const navItems: NavItem[] = [
        {text: "Home", path: "/", auth: AuthRequired.Always},
        {text: "Dashboard", path: "/dashboard", auth: AuthRequired.Authed},
        {text: "Login", path: "/login", auth: AuthRequired.NotAuthed},
        {text: "Pilots", path: "/pilots", auth: AuthRequired.Always},
        {text: "Flights", path: "/flights", auth: AuthRequired.Always},
        {text: "Sites", path: "/sites", auth: AuthRequired.Always},
    ]

    return <div className={styles.container}>
        <div className={styles.content}>
            <a href="/" className={styles.headerTitle}>
                <span>🪂</span>
                <span>{BRAND_NAME}</span>
            </a>
            <nav className={styles.nav}>
                <div className={styles.mobileNav}>
                    {navItems.filter((item) => shouldShow(item.auth, isAuthed))
                        .map((item) => <NavItem key={item.text} {...item}/>
                        )
                    }
                    {isAuthed && <SignOut/>}
                </div>
            </nav>
        </div>
    </div>
}