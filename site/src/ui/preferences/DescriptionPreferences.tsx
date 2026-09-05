'use client'

import { useState, useEffect } from 'react';
import { updateDescriptionPreferences } from '@actions/updatePreferences';
import { generateDescriptionPreview } from '@actions/generateDescriptionPreview';
import type { DescriptionPreference } from '@database/descriptionPreferences';
import styles from './DescriptionPreferences.module.css';

type Props = {
    initialPreferences: DescriptionPreference;
    sampleFlight: {
        wing: string;
        start_date: Date;
        takeoff_name: string;
        landing_name: string;
        pilot_id: number;
        strava_activity_id: string;
        duration_sec: number;
        distance_meters: number;
        description: string;
        polyline: [number, number][];
        landing_id?: string;
        takeoff_id?: string;
    } | null;
};

export default function DescriptionPreferences({ initialPreferences, sampleFlight }: Props) {
    const [preferences, setPreferences] = useState<DescriptionPreference>(initialPreferences);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewDescription, setPreviewDescription] = useState<string>('');

    // Generate preview description based on current preferences
    useEffect(() => {
        if (!sampleFlight) {
            setPreviewDescription('No flights available for preview');
            return;
        }

        let isActive = true;

        (async () => {
            try {
                setPreviewDescription('Generating preview...');
                
                const preview = await generateDescriptionPreview(preferences, sampleFlight);
                
                if (isActive) {
                    setPreviewDescription(preview);
                }
            } catch (error) {
                console.error('Error generating preview:', error);
                if (isActive) {
                    setPreviewDescription('Error generating preview');
                }
            }
        })();

        return () => {
            isActive = false;
        };
    }, [preferences, sampleFlight]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitting(true);
        
        try {
            const formData = new FormData(event.currentTarget);
            await updateDescriptionPreferences(formData);
        } catch (error) {
            console.error('Failed to update preferences:', error);
            alert('Failed to update preferences. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCheckboxChange = (field: keyof Omit<DescriptionPreference, 'pilot_id'>) => {
        setPreferences(prev => ({
            ...prev,
            [field]: !prev[field]
        }));
    };

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>Flight Description Preferences</h3>
            <p className={styles.subtitle}>
                Customize what information appears in your Strava activity descriptions
            </p>
            
            <div className={styles.content}>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.checkboxGroup}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                name="include_sites"
                                checked={preferences.include_sites}
                                onChange={() => handleCheckboxChange('include_sites')}
                                className={styles.checkbox}
                            />
                            <span className={styles.checkboxText}>
                                Include takeoff and landing sites
                            </span>
                        </label>

                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                name="include_wind"
                                checked={preferences.include_wind}
                                onChange={() => handleCheckboxChange('include_wind')}
                                disabled={!preferences.include_sites}
                                className={styles.checkbox}
                            />
                            <span className={styles.checkboxText}>
                                Include wind conditions (requires sites)
                            </span>
                        </label>

                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                name="include_wing_aggregate"
                                checked={preferences.include_wing_aggregate}
                                onChange={() => handleCheckboxChange('include_wing_aggregate')}
                                className={styles.checkbox}
                            />
                            <span className={styles.checkboxText}>
                                Include wing statistics
                            </span>
                        </label>

                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                name="include_year_aggregate"
                                checked={preferences.include_year_aggregate}
                                onChange={() => handleCheckboxChange('include_year_aggregate')}
                                className={styles.checkbox}
                            />
                            <span className={styles.checkboxText}>
                                Include year statistics
                            </span>
                        </label>

                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                name="include_all_time_aggregate"
                                checked={preferences.include_all_time_aggregate}
                                onChange={() => handleCheckboxChange('include_all_time_aggregate')}
                                className={styles.checkbox}
                            />
                            <span className={styles.checkboxText}>
                                Include all-time statistics
                            </span>
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className={styles.submitButton}
                    >
                        {isSubmitting ? 'Saving...' : 'Save Preferences'}
                    </button>
                </form>

                <div className={styles.preview}>
                    <h4 className={styles.previewTitle}>Preview</h4>
                    <div className={styles.previewBox}>
                        <pre className={styles.previewText}>{previewDescription}</pre>
                    </div>
                </div>
            </div>
        </div>
    );
}