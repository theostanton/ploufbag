'use client'

import { useEffect, useState } from 'react'
import { EMPTY_FLIGHTS, EMPTY_SITES, FlightCollection, SiteCollection } from './geo'

/**
 * Loads the two shared collections once per page load.
 *
 * Cached at module scope rather than in the store or per-component state: the
 * map mounts once and never unmounts, but React StrictMode mounts it twice in
 * development, and a soft navigation must never refetch a payload this size.
 * The promise is cached, not just the result, so two callers racing on first
 * paint share one request.
 */

export type BaseData = {
    flights: FlightCollection
    sites: SiteCollection
}

export type BaseDataState = BaseData & {
    status: 'loading' | 'ready' | 'error'
    error: string | null
}

const EMPTY: BaseData = { flights: EMPTY_FLIGHTS, sites: EMPTY_SITES }

let cached: Promise<BaseData> | null = null

async function fetchCollection<T>(url: string, fallback: T): Promise<T> {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`${url} responded ${response.status}`)
    }
    const body = await response.json()
    // The route returns { error } with a 500 on a failed query, but a proxy or a
    // rewrite can produce a 200 carrying something else entirely.
    if (!body || body.type !== 'FeatureCollection') {
        throw new Error(`${url} did not return a FeatureCollection`)
    }
    return (body as T) ?? fallback
}

function load(): Promise<BaseData> {
    if (!cached) {
        cached = Promise.all([
            fetchCollection<FlightCollection>('/api/geo/flights', EMPTY_FLIGHTS),
            fetchCollection<SiteCollection>('/api/geo/sites', EMPTY_SITES),
        ])
            .then(([flights, sites]) => ({ flights, sites }))
            .catch((error) => {
                // Clear the cache on failure so a later mount can retry rather
                // than replaying the rejection forever.
                cached = null
                throw error
            })
    }
    return cached
}

export function useBaseData(): BaseDataState {
    const [state, setState] = useState<BaseDataState>({
        ...EMPTY,
        status: 'loading',
        error: null,
    })

    useEffect(() => {
        let active = true
        load()
            .then((data) => {
                if (active) setState({ ...data, status: 'ready', error: null })
            })
            .catch((error: Error) => {
                if (active) setState({ ...EMPTY, status: 'error', error: error.message })
            })
        return () => {
            active = false
        }
    }, [])

    return state
}
