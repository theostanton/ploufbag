'use client'

import styles from "@ui/chrome/TopBar.module.css";
import {signOut} from "../app/actions/signout";

/**
 * A button, not a div. The previous version was a <div onClick>, which is not
 * focusable, not reachable by keyboard, and announces as nothing to a screen
 * reader — the one control that ends your session.
 */
export function SignOut() {
    return (
        <button type="button" className={styles.navItem} onClick={() => signOut()}>
            Sign out
        </button>
    )
}
