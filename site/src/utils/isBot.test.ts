import {describe, expect, it} from 'vitest';
import {isBotUserAgent} from './isBot';

describe('isBotUserAgent', () => {
    it('treats real browser user agents as human', () => {
        const browsers = [
            // Desktop Chrome
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            // iOS Safari, which is what a click from the Strava mobile app opens
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
            // Android Chrome
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        ];

        for (const userAgent of browsers) {
            expect(isBotUserAgent(userAgent), userAgent).toBe(false);
        }
    });

    it('flags crawlers, scripts and monitors', () => {
        const bots = [
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
            'curl/8.4.0',
            'python-requests/2.31.0',
            'Go-http-client/2.0',
            'HeadlessChrome/120.0.0.0',
            'GoogleStackdriverMonitoring-UptimeChecks',
        ];

        for (const userAgent of bots) {
            expect(isBotUserAgent(userAgent), userAgent).toBe(true);
        }
    });

    it('treats a missing user agent as a bot', () => {
        // Every real browser sends one, so an absent header is a script or probe.
        expect(isBotUserAgent(null)).toBe(true);
        expect(isBotUserAgent(undefined)).toBe(true);
        expect(isBotUserAgent('')).toBe(true);
    });

    it('matches case-insensitively', () => {
        expect(isBotUserAgent('SomeCrawlerBot/1.0')).toBe(true);
        expect(isBotUserAgent('CURL/8.4.0')).toBe(true);
    });
});
