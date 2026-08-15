import {beforeEach, describe, expect, it, vi} from 'vitest';
import {NextRequest} from 'next/server';
import {ATHLETE_CAPACITY, STRAVA_AUTHORIZE_URL} from '@model/signup';

vi.mock('@database/analytics', () => ({
    recordEvent: vi.fn()
}));

vi.mock('@database/pilots', () => ({
    getCount: vi.fn()
}));

async function callConnect() {
    const {GET} = await import('./route');
    return GET(new NextRequest('https://ploufbag.com/connect'));
}

describe('/connect - Unit Tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('sends an athlete to Strava when there are spots left', async () => {
        const {getCount} = await import('@database/pilots');
        vi.mocked(getCount).mockResolvedValue(ATHLETE_CAPACITY - 1);

        const response = await callConnect();

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe(STRAVA_AUTHORIZE_URL);
    });

    it('sends an athlete home when at capacity', async () => {
        const {getCount} = await import('@database/pilots');
        vi.mocked(getCount).mockResolvedValue(ATHLETE_CAPACITY);

        const response = await callConnect();

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('https://ploufbag.com/?full=1');
    });

    it('records the attempt even when turned away at capacity', async () => {
        // The whole point of tracking: a click we had to refuse is still demand.
        const {getCount} = await import('@database/pilots');
        const {recordEvent} = await import('@database/analytics');
        vi.mocked(getCount).mockResolvedValue(ATHLETE_CAPACITY);

        await callConnect();

        expect(recordEvent).toHaveBeenCalledWith('signup_click', '/connect', expect.anything());
    });

    it('fails open to Strava when the capacity check throws', async () => {
        // Strava enforces the real cap anyway, so a database outage must not be
        // the reason nobody can sign up.
        const {getCount} = await import('@database/pilots');
        vi.mocked(getCount).mockRejectedValue(new Error('connection refused'));

        const response = await callConnect();

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe(STRAVA_AUTHORIZE_URL);
    });
});
