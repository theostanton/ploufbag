'use client'

import React, { useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Polyline } from '@ploufbag/common';
import BaseMap from './BaseMap';
import {formatSiteName} from '../utils/formatSiteName';

interface FlightMapProps {
  polyline: Polyline;
  takeoffSite?: { name: string; lat: number; lng: number } | null;
  landingSite?: { name: string; lat: number; lng: number } | null;
  className?: string;
}

export default function FlightMap({ polyline, takeoffSite, landingSite, className }: FlightMapProps) {
  const onMapLoad = useCallback((map: mapboxgl.Map) => {
    // Add flight path
    const flightLineCoordinates = polyline.map(([lat, lng]) => [lng, lat]);

    map.addSource('flight-path', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: flightLineCoordinates
        }
      }
    });

    map.addLayer({
      id: 'flight-path',
      type: 'line',
      source: 'flight-path',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#3b82f6', // Primary blue color
        'line-width': 4,
        'line-opacity': 0.8
      }
    });

    // Add takeoff marker
    if (takeoffSite) {
      new mapboxgl.Marker({
        color: '#22c55e', // Green for takeoff
        scale: 1.2
      })
        .setLngLat([takeoffSite.lng, takeoffSite.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`
          <div style="font-weight: bold; color: #22c55e;">↗️ Takeoff</div>
          <div>${formatSiteName(takeoffSite.name)}</div>
        `))
        .addTo(map);
    }

    // Add landing marker
    if (landingSite) {
      new mapboxgl.Marker({
        color: '#ef4444', // Red for landing
        scale: 1.2
      })
        .setLngLat([landingSite.lng, landingSite.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`
          <div style="font-weight: bold; color: #ef4444;">↘️ Landing</div>
          <div>${formatSiteName(landingSite.name)}</div>
        `))
        .addTo(map);
    }
  }, [polyline, takeoffSite, landingSite]);

  if (!polyline || polyline.length === 0) {
    return (
      <div className={className} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)',
        color: 'var(--color-text-secondary)',
        fontSize: 'var(--font-size-sm)'
      }}>
        No flight path data available
      </div>
    );
  }

  // Calculate bounds from polyline
  const bounds = new mapboxgl.LngLatBounds();
  polyline.forEach(([lat, lng]) => {
    bounds.extend([lng, lat]); // Note: Mapbox expects [lng, lat]
  });

  return (
    <BaseMap 
      className={className}
      bounds={bounds}
      onMapLoad={onMapLoad}
    />
  );
}