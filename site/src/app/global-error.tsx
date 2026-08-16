'use client'

import {useEffect} from "react";

/**
 * The last resort: the root layout itself threw.
 *
 * This replaces the whole document, html and body included, so it cannot use
 * the chrome, the design tokens, or the map — none of them exist by the time it
 * renders. That is why the styles here are inline and the markup is plain.
 *
 * It should never be seen. The layout does almost nothing but mount MapRoot, so
 * reaching this means something fundamental broke.
 */
export default function GlobalError({error, reset}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('Global error:', error);
    }, [error]);

    return (
        <html lang="en">
        <body style={{
            margin: 0,
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            backgroundColor: '#0f1310',
            color: 'rgba(255,255,255,0.85)',
        }}>
        <div style={{maxWidth: '36ch', textAlign: 'center', padding: '2rem'}}>
            <p style={{fontSize: '2rem', margin: '0 0 1rem'}}>🪂</p>
            <h1 style={{fontSize: '1.25rem', margin: '0 0 0.75rem'}}>Plouf Bag is having a moment</h1>
            <p style={{fontSize: '0.875rem', lineHeight: 1.6, margin: '0 0 1.5rem', opacity: 0.75}}>
                Something failed before the page could load.
            </p>
            <button
                type="button"
                onClick={reset}
                style={{
                    font: 'inherit',
                    fontSize: '0.875rem',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '0.375rem',
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                }}
            >
                Reload
            </button>
            {error.digest && (
                <p style={{fontSize: '0.75rem', marginTop: '1.5rem', opacity: 0.5}}>
                    Reference {error.digest}
                </p>
            )}
        </div>
        </body>
        </html>
    );
}
