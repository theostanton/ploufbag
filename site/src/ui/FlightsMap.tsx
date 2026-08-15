'use client'

import React, { useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { FlightWithSites } from '@ploufbag/common';
import BaseMap from './BaseMap';
import {formatSiteName} from '../utils/formatSiteName';

interface FlightsMapProps {
  flights: FlightWithSites[];
  className?: string;
}

// Generate a color for each pilot/wing combination
function getFlightColor(pilotId: string, wing: string): string {
  const colors = [
    '#3b82f6', // Blue
    '#ef4444', // Red  
    '#22c55e', // Green
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#84cc16', // Lime
    '#f97316', // Orange
    '#6366f1', // Indigo
  ];
  
  const hash = (pilotId + wing).split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  return colors[Math.abs(hash) % colors.length];
}

export default function FlightsMap({ flights, className }: FlightsMapProps) {
  const onMapLoad = useCallback((map: mapboxgl.Map) => {
    // Track unique sites for markers
    const sites = new Map();
    
    // Add flight paths
    flights.forEach((flight, index) => {
      if (flight.polyline && flight.polyline.length > 0) {
        const flightLineCoordinates = flight.polyline.map(([lat, lng]) => [lng, lat]);
        const color = getFlightColor(String(flight.pilot_id), flight.wing || 'unknown');
        
        const sourceId = `flight-${index}`;
        const layerId = `flight-line-${index}`;
        
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {
              flightId: flight.strava_activity_id,
              wing: flight.wing,
              pilotName: flight.pilot?.first_name || 'Unknown',
              pilotId: flight.pilot_id
            },
            geometry: {
              type: 'LineString',
              coordinates: flightLineCoordinates
            }
          }
        });

        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': color,
            'line-width': 3,
            'line-opacity': 0.7
          }
        });

        // Add click handler for flight paths
        map.on('click', layerId, (e) => {
          if (e.features && e.features[0]) {
            const feature = e.features[0];
            const properties = feature.properties;
            
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font-weight: bold; color: ${color};">✈️ Flight Path</div>
                <div><strong>Pilot:</strong> ${properties?.pilotName}</div>
                <div><strong>Wing:</strong> ${properties?.wing}</div>
                <div><strong>Flight ID:</strong> ${properties?.flightId}</div>
                <div style="margin-top: 8px;">
                  <a href="/flights/${properties?.flightId}" 
                     style="color: #3b82f6; text-decoration: none; font-size: 12px;">
                     View Flight Details →
                  </a>
                </div>
              `)
              .addTo(map);
          }
        });

        // Change cursor on hover
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      // Collect unique sites
      if (flight.takeoff && !sites.has(flight.takeoff.ffvl_sid)) {
        sites.set(flight.takeoff.ffvl_sid, { ...flight.takeoff, type: 'takeoff' });
      }
      if (flight.landing && !sites.has(flight.landing.ffvl_sid)) {
        sites.set(flight.landing.ffvl_sid, { ...flight.landing, type: 'landing' });
      }
    });

    // Add site markers
    sites.forEach((site) => {
      new mapboxgl.Marker({
        color: site.type === 'takeoff' ? '#22c55e' : '#ef4444',
        scale: 0.8
      })
        .setLngLat([site.lng, site.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`
          <div style="font-weight: bold; color: ${site.type === 'takeoff' ? '#22c55e' : '#ef4444'};">
            ${site.type === 'takeoff' ? '↗️' : '↘️'} ${formatSiteName(site.name)}
          </div>
          <div style="margin: 4px 0;">
            <strong>Altitude:</strong> ${site.alt}m<br>
            <strong>Site ID:</strong> ${site.ffvl_sid}
          </div>
          <div style="margin-top: 8px;">
            <a href="/sites/${site.slug}" 
               style="color: #3b82f6; text-decoration: none; font-size: 12px;">
               View Site Details →
            </a>
          </div>
        `))
        .addTo(map);
    });
  }, [flights]);

  if (!flights.length) {
    return (
      <div className={className} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)',
        color: 'var(--color-text-secondary)',
        fontSize: 'var(--font-size-sm)',
        padding: 'var(--space-6)'
      }}>
        No flights to display on map
      </div>
    );
  }

  // Calculate bounds from all flight polylines
  const bounds = new mapboxgl.LngLatBounds();
  let hasValidPolylines = false;
  
  flights.forEach(flight => {
    if (flight.polyline && flight.polyline.length > 0) {
      hasValidPolylines = true;
      flight.polyline.forEach(([lat, lng]) => {
        bounds.extend([lng, lat]);
      });
    }
    // Also include takeoff and landing sites
    if (flight.takeoff) {
      bounds.extend([flight.takeoff.lng, flight.takeoff.lat]);
    }
    if (flight.landing) {
      bounds.extend([flight.landing.lng, flight.landing.lat]);
    }
  });

  return (
    <BaseMap 
      className={className}
      bounds={hasValidPolylines ? bounds : undefined}
      center={hasValidPolylines ? undefined : [2.3, 46.2]}
      zoom={hasValidPolylines ? undefined : 6}
      fitBoundsOptions={{ padding: hasValidPolylines ? 50 : 200 }}
      onMapLoad={onMapLoad}
    >
      {/* Map Legend */}
      {flights.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 'var(--space-4)',
          left: 'var(--space-4)',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          padding: 'var(--space-3)',
          borderRadius: 'var(--border-radius-md)',
          fontSize: 'var(--font-size-xs)',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--color-border)'
        }}>
          <div style={{fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)'}}>
            All Flights Overview
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
            <div><span style={{color: '#22c55e'}}>↗️</span> Takeoff sites</div>
            <div><span style={{color: '#ef4444'}}>↘️</span> Landing sites</div>
            <div><span>—</span> Flight paths (colored by pilot/wing)</div>
            <div style={{marginTop: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)'}}>
              {flights.length} total flights
            </div>
          </div>
        </div>
      )}
    </BaseMap>
  );
}