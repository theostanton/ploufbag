'use client'

import React, { useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { FlightWithSites, Site } from '@ploufbag/common';
import BaseMap from './BaseMap';
import {formatSiteName} from '../utils/formatSiteName';

interface SiteMapProps {
  site: Site;
  flights: FlightWithSites[];
  className?: string;
}

export default function SiteMap({ site, flights, className }: SiteMapProps) {
  const onMapLoad = useCallback((map: mapboxgl.Map) => {
    // Add site marker with distinctive styling
    new mapboxgl.Marker({
      color: '#8b5cf6', // Purple for the main site
      scale: 2
    })
      .setLngLat([site.lng, site.lat])
      .setPopup(new mapboxgl.Popup().setHTML(`
        <div style="font-weight: bold; color: #8b5cf6; font-size: 16px;">🏔️ ${formatSiteName(site.name)}</div>
        <div style="margin: 8px 0;">
          <strong>Altitude:</strong> ${site.alt}m<br>
          <strong>Coordinates:</strong> ${site.lat.toFixed(6)}, ${site.lng.toFixed(6)}<br>
          <strong>Site ID:</strong> ${site.ffvl_sid}
        </div>
        <div style="color: #666; font-size: 12px;">
          ${flights.length} flight${flights.length !== 1 ? 's' : ''} recorded
        </div>
      `))
      .addTo(map);

    // Add flight paths
    const takeoffFlights = flights.filter(f => f.takeoff?.ffvl_sid === site.ffvl_sid);
    const landingFlights = flights.filter(f => f.landing?.ffvl_sid === site.ffvl_sid);

    // Add takeoff flights (green paths)
    takeoffFlights.forEach((flight, index) => {
      if (flight.polyline && flight.polyline.length > 0) {
        const flightLineCoordinates = flight.polyline.map(([lat, lng]) => [lng, lat]);
        
        const sourceId = `takeoff-flight-${index}`;
        const layerId = `takeoff-line-${index}`;
        
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {
              flightId: flight.strava_activity_id,
              wing: flight.wing,
              type: 'takeoff',
              pilotName: flight.pilot?.first_name || 'Unknown'
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
            'line-color': '#22c55e', // Green for takeoff flights
            'line-width': 3,
            'line-opacity': 0.7
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
                <div style="font-weight: bold; color: #22c55e;">↗️ Takeoff Flight</div>
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
    });

    // Add landing flights (red paths)
    landingFlights.forEach((flight, index) => {
      if (flight.polyline && flight.polyline.length > 0 && flight.landing?.ffvl_sid === site.ffvl_sid) {
        const flightLineCoordinates = flight.polyline.map(([lat, lng]) => [lng, lat]);
        
        const sourceId = `landing-flight-${index}`;
        const layerId = `landing-line-${index}`;
        
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {
              flightId: flight.strava_activity_id,
              wing: flight.wing,
              type: 'landing',
              pilotName: flight.pilot?.first_name || 'Unknown'
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
            'line-color': '#ef4444', // Red for landing flights
            'line-width': 3,
            'line-opacity': 0.7
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
                <div style="font-weight: bold; color: #ef4444;">↘️ Landing Flight</div>
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
    });
  }, [site, flights]);

  // Calculate bounds from site and flight paths
  const bounds = new mapboxgl.LngLatBounds();
  
  // Add site location to bounds
  bounds.extend([site.lng, site.lat]);
  
  // Add flight polylines to bounds
  flights.forEach(flight => {
    if (flight.polyline && flight.polyline.length > 0) {
      flight.polyline.forEach(([lat, lng]) => {
        bounds.extend([lng, lat]);
      });
    }
  });

  // If no flights, create a reasonable bounds around the site
  if (flights.length === 0) {
    const padding = 0.01; // ~1km in degrees
    bounds.extend([site.lng - padding, site.lat - padding]);
    bounds.extend([site.lng + padding, site.lat + padding]);
  }

  return (
    <BaseMap 
      className={className}
      bounds={bounds}
      fitBoundsOptions={{ padding: flights.length > 0 ? 50 : 100 }}
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
            {site.name} Flight Activity
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
            <div><span style={{color: '#8b5cf6'}}>🏔️</span> {formatSiteName(site.name)}</div>
            <div><span style={{color: '#22c55e'}}>—</span> Takeoff flights ({flights.filter(f => f.takeoff?.ffvl_sid === site.ffvl_sid).length})</div>
            <div><span style={{color: '#ef4444'}}>—</span> Landing flights ({flights.filter(f => f.landing?.ffvl_sid === site.ffvl_sid).length})</div>
          </div>
        </div>
      )}
    </BaseMap>
  );
}