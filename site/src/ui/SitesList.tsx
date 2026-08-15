'use client'

import {Site} from "@ploufbag/common";
import SiteItem from "@ui/SiteItem";
import {useState} from "react";
import styles from "@styles/Page.module.css";

type SiteWithFlightCount = Site & {flightCount: number};

interface SitesListProps {
    sites: SiteWithFlightCount[];
}

export default function SitesList({sites}: SitesListProps) {
    const [showOnlyWithFlights, setShowOnlyWithFlights] = useState(false);
    
    const filteredSites = showOnlyWithFlights 
        ? sites.filter(site => site.flightCount > 0)
        : sites;
    
    const totalSites = sites.length;
    const sitesWithFlights = sites.filter(site => site.flightCount > 0).length;
    
    return (
        <div style={{width: '100%', maxWidth: '100%'}}>
            <div style={{
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: 'var(--space-6)',
                padding: 'var(--space-4)',
                background: 'var(--color-surface)',
                borderRadius: 'var(--border-radius-lg)',
                border: '1px solid var(--color-border)',
                width: '100%',
                boxSizing: 'border-box',
                flexWrap: 'wrap',
                gap: 'var(--space-3)'
            }}>
                <div style={{
                    minWidth: '200px',
                    flex: '1 1 auto'
                }}>
                    <div style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-1)',
                        whiteSpace: 'nowrap'
                    }}>
                        Showing {filteredSites.length} of {totalSites} sites
                        {showOnlyWithFlights && ` (${sitesWithFlights} with flights)`}
                    </div>
                </div>
                
                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-medium)',
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                }}>
                    <input
                        type="checkbox"
                        checked={showOnlyWithFlights}
                        onChange={(e) => setShowOnlyWithFlights(e.target.checked)}
                        style={{
                            width: '1rem',
                            height: '1rem',
                            accentColor: 'var(--color-primary)'
                        }}
                    />
                    Only show sites with flights
                </label>
            </div>
            
            <div style={{width: '100%'}}>
                {filteredSites.map(site =>
                    <SiteItem key={site.ffvl_sid} site={site}/>
                )}
            </div>
            
            {filteredSites.length === 0 && showOnlyWithFlights && (
                <div style={{
                    textAlign: 'center',
                    padding: 'var(--space-12)',
                    color: 'var(--color-text-secondary)',
                    width: '100%'
                }}>
                    No sites found with flights.
                </div>
            )}
        </div>
    );
}