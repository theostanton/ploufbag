'use client'

import {useEffect, useState} from "react";

export default function ClientOnlyDate({date, format = 'full'}: {date: Date, format?: 'full' | 'date' | 'time' | 'short'}) {
    const [formattedDate, setFormattedDate] = useState<string>('');
    const [isClient, setIsClient] = useState(false);
    
    useEffect(() => {
        setIsClient(true);
        let formatted: string;
        
        if (format === 'full') {
            formatted = new Intl.DateTimeFormat('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(new Date(date));
        } else if (format === 'short') {
            // Compact form for list rows in the chrome panels, where the full
            // weekday-and-year string does not fit.
            formatted = new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric'
            }).format(new Date(date));
        } else if (format === 'date') {
            formatted = new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }).format(new Date(date));
        } else {
            formatted = new Intl.DateTimeFormat('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            }).format(new Date(date));
        }
        
        setFormattedDate(formatted);
    }, [date, format]);
    
    if (!isClient) {
        const utcDate = new Date(date);
        if (format === 'time') {
            return <span>{utcDate.getUTCHours().toString().padStart(2, '0')}:{utcDate.getUTCMinutes().toString().padStart(2, '0')}</span>;
        }
        const month = utcDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const day = utcDate.getUTCDate();
        const year = format === 'full' ? ` ${utcDate.getUTCFullYear()}` : '';
        return <span>{month} {day}{year}</span>;
    }
    
    return <span>{formattedDate}</span>;
}