import {describe, expect, it} from 'vitest';
import {ATHLETE_CAPACITY, STRAVA_AUTHORIZE_URL, signupState} from './signup';

describe('signupState', () => {
    it('is open with spots left below capacity', () => {
        expect(signupState(0)).toEqual({
            isOpen: true,
            pilotCount: 0,
            capacity: ATHLETE_CAPACITY,
            spotsRemaining: ATHLETE_CAPACITY,
        });

        expect(signupState(1).spotsRemaining).toBe(ATHLETE_CAPACITY - 1);
        expect(signupState(ATHLETE_CAPACITY - 1).isOpen).toBe(true);
    });

    it('closes exactly at capacity', () => {
        const state = signupState(ATHLETE_CAPACITY);
        expect(state.isOpen).toBe(false);
        expect(state.spotsRemaining).toBe(0);
    });

    it('never reports negative spots when over capacity', () => {
        // Strava should prevent this, but a manually inserted pilot or a raised
        // cap on Strava's side without a code change would get us here, and
        // spotsRemaining is rendered directly.
        const state = signupState(ATHLETE_CAPACITY + 5);
        expect(state.isOpen).toBe(false);
        expect(state.spotsRemaining).toBe(0);
    });
});

describe('STRAVA_AUTHORIZE_URL', () => {
    it('is byte-identical to the URL previously inlined in the login page', () => {
        // Pinned deliberately. This URL is one that Strava currently accepts;
        // percent-encoding the scope separators or changing the redirect_uri
        // would be a silent behaviour change that only shows up as a rejected
        // OAuth request in production.
        expect(STRAVA_AUTHORIZE_URL).toBe(
            'https://www.strava.com/oauth/authorize' +
            '?client_id=155420' +
            '&redirect_uri=https%3A%2F%2Fwebhooks.ploufbag.com' +
            '&response_type=code' +
            '&approval_prompt=force' +
            '&scope=read_all,activity:write,activity:read_all'
        );
    });
});
