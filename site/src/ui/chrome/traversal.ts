/**
 * Whether the route being shown was reached with the browser's back or forward
 * button, rather than by a link.
 *
 * A panel that restores where the reader was (/flights) should only do so on a
 * traversal: going back means "where I was", clicking a link means "start
 * again". The app router does not say which kind of navigation brought a page
 * in, so this listens for `popstate` itself and remembers the path it went to.
 *
 * The listener is registered when this module loads, and the module is loaded
 * by Sheet, which is in the root layout. Registered by the panel instead, it
 * would miss the traversal that brings the panel's own code in — going back to
 * /flights from a detail page that was opened directly.
 *
 * Remembering the path, not just "a popstate happened", is what keeps a stale
 * traversal from leaking: back to /pilots and then a link to /flights does not
 * match, so /flights starts at the top.
 */
let traversedTo: string | null = null

if (typeof window !== 'undefined') {
    // Capture, so this runs before the router's own listener: React renders a
    // popstate navigation synchronously, inside that listener, and the panel's
    // mount has to find this already set.
    window.addEventListener('popstate', () => {
        traversedTo = window.location.pathname
    }, { capture: true })
}

/**
 * True once if the last traversal landed on `pathname`. Consuming it means a
 * later remount of the same panel — say, after a link back to it — is not
 * mistaken for the traversal.
 */
export function consumeTraversal(pathname: string): boolean {
    const matched = traversedTo === pathname
    if (matched) traversedTo = null
    return matched
}
