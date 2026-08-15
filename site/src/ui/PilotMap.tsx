'use client'

import React, { useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { FlightWithSites } from '@ploufbag/common';
import BaseMap from './BaseMap';
import {formatSiteName} from '../utils/formatSiteName';

interface PilotMapProps {
  flights: FlightWithSites[];
  pilotName: string;
  className?: string;
}

export default function PilotMap({ flights, pilotName, className }: PilotMapProps) {
  const onMapLoad = useCallback((map: mapboxgl.Map) => {
    if (!flights || flights.length === 0) return;

    // Collect unique sites
    const siteMap = new Map();

    // Add flight paths
    flights.forEach((flight, index) => {
      if (flight.polyline && flight.polyline.length > 0) {
        const flightLineCoordinates = flight.polyline.map(([lat, lng]) => [lng, lat]);
        
        const sourceId = `pilot-flight-${index}`;
        const layerId = `pilot-flight-line-${index}`;
        
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {
              flightId: flight.strava_activity_id,
              wing: flight.wing,
              date: flight.start_date
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
            'line-color': '#3b82f6',
            'line-width': 3,
            'line-opacity': 0.6
          }
        });

        // Add click handler
        map.on('click', layerId, (e) => {
          if (e.features && e.features[0]) {
            const feature = e.features[0];
            const properties = feature.properties;
            
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font-weight: bold; color: #3b82f6;">✈️ ${pilotName}'s Flight</div>
                <div><strong>Wing:</strong> ${properties?.wing}</div>
                <div><strong>Date:</strong> ${new Date(properties?.date).toLocaleDateString()}</div>
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

      // Track sites visited by this pilot
      if (flight.takeoff) {
        const siteKey = flight.takeoff.ffvl_sid;
        if (!siteMap.has(siteKey)) {
          siteMap.set(siteKey, {
            site: flight.takeoff,
            isTakeoff: true,
            isLanding: false,
            flights: 1
          });
        } else {
          const existing = siteMap.get(siteKey);
          existing.isTakeoff = true;
          existing.flights += 1;
        }
      }

      if (flight.landing) {
        const siteKey = flight.landing.ffvl_sid;
        if (!siteMap.has(siteKey)) {
          siteMap.set(siteKey, {
            site: flight.landing,
            isTakeoff: false,
            isLanding: true,
            flights: 1
          });
        } else {
          const existing = siteMap.get(siteKey);
          existing.isLanding = true;
          existing.flights += 1;
        }
      }
    });

    // Add site markers with different colors based on usage
    siteMap.forEach((siteData) => {
      const { site, isTakeoff, isLanding, flights } = siteData;
      let color, icon;

      if (isTakeoff && isLanding) {
        color = '#8b5cf6'; // Purple for both takeoff and landing
        icon = '🔄';
      } else if (isTakeoff) {
        color = '#22c55e'; // Green for takeoff
        icon = '🛫';
      } else if (isLanding) {
        color = '#ef4444'; // Red for landing
        icon = '🛬';
      }

      new mapboxgl.Marker({
        color: color,
        scale: 1.2
      })
        .setLngLat([site.lng, site.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`
          <div style="font-weight: bold; color: ${color};">${icon} ${formatSiteName(site.name)}</div>
          <div style="margin: 4px 0;">
            <strong>Used for:</strong> ${isTakeoff && isLanding ? 'Takeoff & Landing' : isTakeoff ? 'Takeoff' : 'Landing'}<br>
            <strong>Flights:</strong> ${flights}<br>
            <strong>Altitude:</strong> ${site.alt}m
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
  }, [flights, pilotName]);

  if (!flights || flights.length === 0) {
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

  // Calculate bounds from all flights and sites
  const bounds = new mapboxgl.LngLatBounds();
  
  flights.forEach(flight => {
    // Add polyline points to bounds
    if (flight.polyline && flight.polyline.length > 0) {
      flight.polyline.forEach(([lat, lng]) => {
        bounds.extend([lng, lat]);
      });
    }
    
    // Add site locations to bounds
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
      bounds={bounds}
      onMapLoad={onMapLoad}
    >
      {/* Map Legend */}
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
          {pilotName}'s Flying Activity
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
          <div><span style={{color: '#22c55e'}}>🛫</span> Takeoff sites</div>
          <div><span style={{color: '#ef4444'}}>🛬</span> Landing sites</div>
          <div><span style={{color: '#8b5cf6'}}>🔄</span> Both takeoff & landing</div>
          <div><span style={{color: '#3b82f6'}}>—</span> Flight paths</div>
          <div style={{marginTop: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)'}}>
            {flights.length} total flights
          </div>
        </div>
      </div>
    </BaseMap>
  );
}