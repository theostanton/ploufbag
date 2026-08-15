import styles from "@styles/Page.module.css";
import {Metadata} from "next";
import {createMetadata} from "@ui/metadata";
import {BRAND_NAME} from "@ui/brand";
import ConnectWithStrava from "@ui/ConnectWithStrava";
import {getCount} from "@database/pilots";
import {signupState} from "@model/signup";

export const metadata: Metadata = createMetadata('Login')

/**
 * Reads the live pilot count for the capacity gate, so it must not be cached
 * into a page that keeps offering a full signup.
 */
export const dynamic = 'force-dynamic';

export default async function Login() {
    // Fail open, matching / and /connect: a database blip should not hide the
    // only way in. Strava still enforces the real athlete cap.
    const pilotCount = await getCount().catch(error => {
        console.error('login: pilot count failed, showing signup anyway:', error);
        return 0;
    });
    const state = signupState(pilotCount);

    return <div className={styles.loginPageContainer}>
        <div className={styles.loginContent}>
            <div style={{ marginBottom: 'var(--space-6)' }}>
                <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>🪂</div>
                <h1 className={styles.title} style={{ fontSize: 'var(--font-size-3xl)', marginBottom: 'var(--space-3)' }}>
                    Welcome to {BRAND_NAME}
                </h1>
                <p className={styles.subtitle} style={{ fontSize: 'var(--font-size-lg)', marginBottom: '0' }}>
                    Track your paragliding adventures with data from Strava
                </p>
            </div>

            <div style={{ marginBottom: 'var(--space-6)' }}>
                <p className={styles.description} style={{ fontSize: 'var(--font-size-base)', marginBottom: '0' }}>
                    Connect your Strava account to automatically sync your paragliding flights 
                    and get detailed insights into your flying performance.
                </p>
            </div>

            <div className={styles.loginFeatures} style={{ marginBottom: 'var(--space-6)' }}>
                <h3 style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)' }}>
                    How {BRAND_NAME} enhances your Strava activities:
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                        <div style={{ 
                            backgroundColor: 'var(--color-primary)', 
                            color: 'var(--color-text-inverse)', 
                            borderRadius: '50%', 
                            width: '24px', 
                            height: '24px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: 'var(--font-size-sm)', 
                            fontWeight: 'var(--font-weight-semibold)',
                            flexShrink: 0
                        }}>
                            1
                        </div>
                        <div>
                            <strong style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}>
                                Sync your flights
                            </strong>
                            <p style={{ margin: '0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                We automatically detect paragliding activities from your Strava account
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                        <div style={{ 
                            backgroundColor: 'var(--color-primary)', 
                            color: 'var(--color-text-inverse)', 
                            borderRadius: '50%', 
                            width: '24px', 
                            height: '24px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: 'var(--font-size-sm)', 
                            fontWeight: 'var(--font-weight-semibold)',
                            flexShrink: 0
                        }}>
                            2
                        </div>
                        <div>
                            <strong style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}>
                                AI generates descriptions
                            </strong>
                            <p style={{ margin: '0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                Our AI analyzes your flight data and creates detailed, personalized descriptions
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                        <div style={{ 
                            backgroundColor: 'var(--color-primary)', 
                            color: 'var(--color-text-inverse)', 
                            borderRadius: '50%', 
                            width: '24px', 
                            height: '24px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: 'var(--font-size-sm)', 
                            fontWeight: 'var(--font-weight-semibold)',
                            flexShrink: 0
                        }}>
                            3
                        </div>
                        <div>
                            <strong style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}>
                                Descriptions added to Strava
                            </strong>
                            <p style={{ margin: '0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                Enhanced descriptions are automatically added back to your Strava activities
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: 'var(--space-6)' }}>
                {state.isOpen
                    ? <>
                        <ConnectWithStrava/>
                        <p className={styles.description}
                           style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-3)', marginBottom: 0 }}>
                            Early access &mdash; {state.spotsRemaining} of {state.capacity} spots left.
                        </p>
                    </>
                    : <div className={`${styles.alert} ${styles.alertWarning}`}>
                        <strong>All {state.capacity} spots are taken.</strong>
                        <p style={{ margin: 'var(--space-2) 0 0 0' }}>
                            Strava caps how many athletes can connect to {BRAND_NAME} while it is in
                            early access. Check back once the cap is raised.
                        </p>
                    </div>}
            </div>

            <div className={styles.loginFeatures}>
                <h3 style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)' }}>
                    What you'll get:
                </h3>
                <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    <li style={{ marginBottom: 'var(--space-1)' }}>Automatic flight detection</li>
                    <li style={{ marginBottom: 'var(--space-1)' }}>Performance metrics</li>
                    <li style={{ marginBottom: 'var(--space-1)' }}>Site identification</li>
                    <li>AI flight descriptions</li>
                </ul>
            </div>
        </div>
    </div>
}
