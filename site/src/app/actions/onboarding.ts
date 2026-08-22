'use server'

import { Auth } from "@auth/index";
import { Activities, Pilots, Wings, isSuccess } from "@ploufbag/common";
import { getPilotFlightsByMonth, getPilotTotals } from "@database/stats";
import { revalidatePath } from 'next/cache';
import { actionError, actionOk, type ActionResult } from "@model/ActionResult";
import { triggerTask } from "@actions/tasks";

/**
 * What the first-run experience needs to know, and the two things it can change.
 *
 * The reveal has to work on partial data. The scan is queued when a pilot
 * connects and lands a few seconds later, so the page is built to be opened
 * before there is anything to show and to fill in underneath them -- rather than
 * blocking on a sync and showing a spinner where the payoff should be.
 */

export type OnboardingState = {
    /** Activities we have looked at. Zero means the first scan has not landed. */
    scanned: number
    flights: number
    unsure: number
    airtimeSec: number
    sites: number
    firstFlight: string | null
    longestKm: number
    wings: Array<{ wing_id: string; name: string; colour: string; flown_from: string | null; flown_until: string | null }>
    monthly: Array<{ month: string; flights: number }>
    /** The pilot's own most-used Strava types, for when we found nothing. */
    types: Array<{ type: string; activities: number }>
    chosenTypes: string[] | null
}

export async function getOnboardingState(): Promise<OnboardingState> {
    const pilotId = await Auth.getSelfPilotId()

    const [counts, totals, wings, monthly, types, chosen] = await Promise.all([
        Activities.countsForPilot(pilotId),
        getPilotTotals(pilotId),
        Wings.getForPilot(pilotId),
        getPilotFlightsByMonth(pilotId),
        Activities.typeCountsForPilot(pilotId),
        Pilots.getFlightActivityTypes(pilotId),
    ])

    const verdicts = isSuccess(counts) ? counts[0] : { flight: 0, unsure: 0, not_flight: 0 }
    const totalsValue = isSuccess(totals)
        ? totals[0]
        : { flights: 0, airtime_sec: 0, sites: 0, first_flight: null, longest_km: 0 }

    return {
        scanned: verdicts.flight + verdicts.unsure + verdicts.not_flight,
        // The flight count comes from the flights table rather than the verdict
        // count, because that is what is actually on the map behind this page.
        // Promotion is bounded per run, so the two disagree for a minute after a
        // big first scan, and the honest number is the one you can go and look at.
        flights: totalsValue.flights,
        unsure: verdicts.unsure,
        airtimeSec: totalsValue.airtime_sec,
        sites: totalsValue.sites,
        firstFlight: totalsValue.first_flight,
        longestKm: totalsValue.longest_km,
        wings: (isSuccess(wings) ? wings[0] : []).map(wing => ({
            wing_id: wing.wing_id,
            name: wing.name,
            colour: wing.colour,
            flown_from: wing.flown_from,
            flown_until: wing.flown_until,
        })),
        monthly: isSuccess(monthly) ? monthly[0] : [],
        types: isSuccess(types) ? types[0] : [],
        chosenTypes: isSuccess(chosen) ? chosen[0] : null,
    }
}

/**
 * Records which Strava activity types this pilot logs flights as, and reads
 * their history again through the answer.
 *
 * The fix for the failure that used to be silent and permanent: the importer
 * only ever considered Workout and Kitesurf, so a pilot who logs flights as a
 * Hike saw an empty account for ever and was never told why.
 */
export async function chooseFlightActivityTypes(types: string[]): Promise<ActionResult> {
    const pilotId = await Auth.getSelfPilotId()

    if (types.length === 0) {
        return actionError('Pick at least one')
    }

    const saved = await Pilots.setFlightActivityTypes(pilotId, types)
    if (!isSuccess(saved)) {
        return actionError(saved[1])
    }

    // The setting is worthless until the history is read again through it.
    try {
        await triggerTask({ name: 'FetchAllActivities', pilotId })
    } catch (error) {
        console.error('Could not queue a re-scan:', error)
        return actionOk('Saved. Your flights will appear after the next sync.')
    }

    revalidatePath('/welcome')
    revalidatePath('/activities')
    return actionOk('Reading your Strava account again…')
}
