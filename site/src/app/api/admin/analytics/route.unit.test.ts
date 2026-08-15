import {beforeEach, describe, expect, it, vi} from 'vitest';
import {NextRequest} from 'next/server';

vi.mock('@database/analytics', () => ({
    getAnalyticsSummary: vi.fn()
}));

const SUMMARY = {
    period_hours: 24,
    landings: 12,
    unique_landings: 9,
    signup_clicks: 3,
    unique_signup_clicks: 2,
    signups_completed: 1,
    pilots_total: 4,
    bot_landings: 87,
};

async function callRoute(query: string = '') {
    const {GET} = await import('./route');
    return GET(new NextRequest(`http://localhost:3000/api/admin/analytics${query}`));
}

describe('/api/admin/analytics - Unit Tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns the summary and defaults to a 24 hour window', async () => {
        const {getAnalyticsSummary} = await import('@database/analytics');
        vi.mocked(getAnalyticsSummary).mockResolvedValue(SUMMARY);

        const response = await callRoute();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(SUMMARY);
        expect(getAnalyticsSummary).toHaveBeenCalledWith(24);
    });

    it('passes an explicit hours parameter through', async () => {
        const {getAnalyticsSummary} = await import('@database/analytics');
        vi.mocked(getAnalyticsSummary).mockResolvedValue({...SUMMARY, period_hours: 168});

        await callRoute('?hours=168');

        expect(getAnalyticsSummary).toHaveBeenCalledWith(168);
    });

    it.each([
        ['?hours=0', 'zero'],
        ['?hours=-5', 'negative'],
        ['?hours=abc', 'non-numeric'],
        ['?hours=99999', 'beyond a year'],
    ])('rejects %s (%s) without querying', async (query) => {
        const {getAnalyticsSummary} = await import('@database/analytics');

        const response = await callRoute(query);

        expect(response.status).toBe(400);
        expect(getAnalyticsSummary).not.toHaveBeenCalled();
    });

    it('returns 500 when the query fails', async () => {
        const {getAnalyticsSummary} = await import('@database/analytics');
        vi.mocked(getAnalyticsSummary).mockRejectedValue(new Error('relation "analytics_events" does not exist'));

        const response = await callRoute();

        expect(response.status).toBe(500);
    });
});
