import { NextRequest, NextResponse } from 'next/server'

/**
 * Development-only forwarder for Mapbox requests.
 *
 * Some sandboxed environments (CI runners, remote agent containers) allow
 * outbound HTTPS from the Node process but not from the browser, so the page
 * loads while every tile, glyph and sprite fails with a connection reset and the
 * map is a blank rectangle. This hands those requests to the server, which can
 * make them.
 *
 * It exists so the map can be *seen* while it is being built. It is not a
 * production feature and must never become one:
 *
 *   - It 404s outside development.
 *   - It requires PLOUFBAG_DEV_MAP_PROXY to be set, so merely running `next dev`
 *     does not switch it on.
 *   - The target host is checked against an explicit allowlist. An unrestricted
 *     "fetch whatever the query string says" endpoint is a server-side request
 *     forgery hole, and this one would be reachable by anyone who can load the
 *     page.
 *
 * MapCanvas rewrites Mapbox URLs to point here via the map's transformRequest
 * hook, under the same flag.
 */

const ALLOWED_HOSTS = new Set([
    'api.mapbox.com',
    'a.tiles.mapbox.com',
    'b.tiles.mapbox.com',
    'c.tiles.mapbox.com',
    'd.tiles.mapbox.com',
    'tiles.mapbox.com',
])

const isEnabled = () =>
    process.env.NODE_ENV !== 'production' && Boolean(process.env.PLOUFBAG_DEV_MAP_PROXY)

export async function GET(request: NextRequest) {
    if (!isEnabled()) {
        return new NextResponse('Not found', { status: 404 })
    }

    const target = request.nextUrl.searchParams.get('u')
    if (!target) {
        return NextResponse.json({ error: 'missing u' }, { status: 400 })
    }

    let url: URL
    try {
        url = new URL(target)
    } catch {
        return NextResponse.json({ error: 'malformed u' }, { status: 400 })
    }

    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
        return NextResponse.json({ error: `host not allowed: ${url.hostname}` }, { status: 403 })
    }

    const upstream = await fetch(url, {
        headers: {
            // Mapbox varies sprite and glyph responses on the user agent; passing
            // the browser's through avoids being served something the client
            // cannot decode.
            'User-Agent': request.headers.get('user-agent') ?? 'ploufbag-dev',
            Accept: request.headers.get('accept') ?? '*/*',
        },
    })

    // arrayBuffer rather than streaming the body: tiles, sprites and glyphs are
    // all binary, and this route only ever runs against a local dev server.
    const body = await upstream.arrayBuffer()

    return new NextResponse(body, {
        status: upstream.status,
        headers: {
            'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
            'Cache-Control': 'public, max-age=3600',
        },
    })
}
