import {NextRequest, NextResponse} from 'next/server';
import {getAnalyticsSummary} from '@database/analytics';

export const dynamic = 'force-dynamic';

/** A year. Anything larger is a typo, not a question anyone is asking. */
const MAX_PERIOD_HOURS = 24 * 365;

export async function GET(request: NextRequest) {
    const hoursParam = new URL(request.url).searchParams.get('hours');
    const periodHours = hoursParam ? parseInt(hoursParam) : 24;

    if (isNaN(periodHours) || periodHours <= 0 || periodHours > MAX_PERIOD_HOURS) {
        return NextResponse.json({error: 'Invalid hours parameter'}, {status: 400});
    }

    try {
        return NextResponse.json(await getAnalyticsSummary(periodHours));
    } catch (error) {
        console.error('Error fetching analytics summary:', error);
        return NextResponse.json({error: 'Internal server error'}, {status: 500});
    }
}
