/**
 * Crude user-agent classifier for analytics.
 *
 * The home page is the landing target for the domain stamped on every Strava
 * activity description, so it is also the page crawlers hit hardest. Without
 * this, bot traffic would dwarf the handful of real visits we are trying to
 * count and the numbers would be worthless.
 *
 * Deliberately crude: it errs towards marking things as bots, since an
 * undercounted landing is a much cheaper mistake than a signup funnel that
 * reads as busy when nobody came. The classification is stored per row rather
 * than used to drop the row, so it can be revised later against real data.
 */
const BOT_PATTERNS = [
    'bot', 'crawl', 'spider', 'slurp', 'scrape',
    'curl', 'wget', 'python-requests', 'go-http-client', 'node-fetch', 'axios',
    'headless', 'phantomjs', 'puppeteer', 'playwright', 'lighthouse',
    'monitor', 'uptime', 'pingdom', 'preview', 'fetcher', 'validator',
];

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
    if (!userAgent) {
        // Real browsers always send one. A missing UA is a script or a probe.
        return true;
    }
    const normalised = userAgent.toLowerCase();
    return BOT_PATTERNS.some(pattern => normalised.includes(pattern));
}
