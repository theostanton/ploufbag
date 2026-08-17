import { ReactNode } from 'react'
import { BRAND_NAME } from '@ui/brand'
import ConnectWithStrava from '@ui/ConnectWithStrava'
import { SignupState } from '@model/signup'
import styles from './Pitch.module.css'

/**
 * The pitch, shared by / and /login.
 *
 * These were two near-identical explanations of the same product, written twice
 * — the login page in about 140 lines of inline styles, including three
 * hand-built numbered circles. They drifted, as duplicated marketing copy does:
 * the home page promised "wind conditions at the time you flew" and the login
 * page did not.
 *
 * `notice` is the only real difference between the two callers, and it is why
 * this takes a slot rather than a boolean.
 */

const STEPS = [
    {
        title: 'Connect Strava',
        body: 'We spot paragliding activities in your account automatically. Nothing to tag, nothing to upload.',
    },
    {
        title: 'We work out where you flew',
        body: 'Every flight is matched to its takeoff and landing site, with the wind conditions at the time.',
    },
    {
        title: 'Your stats go back to Strava',
        body: 'The numbers are written onto the activity description, so they are there for anyone who looks.',
    },
]

export default function Pitch({
    state,
    notice,
}: {
    state: SignupState
    /** Shown above the pitch: capacity refusals, or why sign-in was needed. */
    notice?: ReactNode
}) {
    return (
        <div className={styles.pitch}>
            {notice}

            <div className={styles.hero}>
                <span className={styles.mark} aria-hidden="true">🪂</span>
                <h1 className={styles.title}>Your paragliding flights, tracked from Strava.</h1>
                <p className={styles.lede}>
                    {BRAND_NAME} finds your flights, works out where you took off and landed, and
                    writes the stats straight back onto your activity.
                </p>
            </div>

            <div className={styles.cta}>
                {state.isOpen ? (
                    <>
                        <ConnectWithStrava />
                        <p className={styles.spots}>
                            Early access — <strong>{state.spotsRemaining} of {state.capacity}</strong>{' '}
                            spots left.
                        </p>
                    </>
                ) : (
                    <div className={styles.full}>
                        <strong>All {state.capacity} spots are taken.</strong>
                        <p>
                            Strava caps how many athletes can connect to {BRAND_NAME} while it is in
                            early access. Check back once the cap is raised.
                        </p>
                    </div>
                )}
            </div>

            <ol className={styles.steps}>
                {STEPS.map((step, index) => (
                    <li key={step.title} className={styles.step}>
                        <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
                        <span className={styles.stepBody}>
                            <strong className={styles.stepTitle}>{step.title}</strong>
                            <span className={styles.stepText}>{step.body}</span>
                        </span>
                    </li>
                ))}
            </ol>

            {/* The map is right there behind the panel, so say so — it is the
                most persuasive thing on the page and costs a sentence. */}
            <p className={styles.explore}>
                Or look around first: every flight, site and pilot on the map behind this is
                public.
            </p>
        </div>
    )
}
