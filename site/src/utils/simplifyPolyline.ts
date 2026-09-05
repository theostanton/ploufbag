import type { Polyline } from '@ploufbag/common'

/**
 * Ramer-Douglas-Peucker simplification for flight tracks.
 *
 * A Strava track is sampled about once a second, so an hour in the air is ~3600
 * points. At the zoom levels where you can see a whole flight, the great
 * majority of those are sub-pixel and cost bandwidth and GPU time for nothing.
 * Thermal circles are the part worth protecting -- they are what makes a
 * paraglider track recognisable -- and RDP keeps them, because the points on a
 * circle are exactly the ones furthest from the chord.
 *
 * Distances are computed in metres on a local equirectangular projection rather
 * than in raw degrees. In degrees, a tolerance means something different at
 * Chamonix than at the equator, and longitude and latitude are not comparable
 * to each other at all: at 46 degrees north a degree of longitude is about 70%
 * of a degree of latitude, so a degree-space tolerance quietly simplifies
 * east-west detail harder than north-south.
 */

const METRES_PER_DEG_LAT = 111320

/** Squared perpendicular distance from p to the segment ab, in square metres. */
function squaredDistanceToSegment(
    point: [number, number],
    a: [number, number],
    b: [number, number],
    lngScale: number
): number {
    // Project to local metres. The origin is arbitrary; only differences matter.
    const px = point[1] * lngScale
    const py = point[0] * METRES_PER_DEG_LAT
    const ax = a[1] * lngScale
    const ay = a[0] * METRES_PER_DEG_LAT
    const bx = b[1] * lngScale
    const by = b[0] * METRES_PER_DEG_LAT

    const dx = bx - ax
    const dy = by - ay

    if (dx === 0 && dy === 0) {
        return (px - ax) ** 2 + (py - ay) ** 2
    }

    // Projection parameter of p onto ab, clamped to the segment.
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = Math.max(0, Math.min(1, t))

    const cx = ax + t * dx
    const cy = ay + t * dy
    return (px - cx) ** 2 + (py - cy) ** 2
}

/**
 * @param polyline  points as [lat, lng], the convention used throughout the
 *                  database and the common package
 * @param toleranceMetres  maximum deviation a dropped point may have from the
 *                  line kept in its place
 */
export function simplifyPolyline(polyline: Polyline, toleranceMetres = 15): Polyline {
    if (!Array.isArray(polyline) || polyline.length <= 2) {
        return Array.isArray(polyline) ? polyline : []
    }

    // One scale factor for the whole track. A flight spans a few tens of
    // kilometres at most, over which cos(latitude) is effectively constant.
    const lngScale = METRES_PER_DEG_LAT * Math.cos((polyline[0][0] * Math.PI) / 180)
    const toleranceSquared = toleranceMetres * toleranceMetres

    // Iterative rather than recursive: a 20k-point track recurses deep enough to
    // blow the stack on a degenerate input, and this runs on the server for
    // every flight in the collection.
    const keep = new Uint8Array(polyline.length)
    keep[0] = 1
    keep[polyline.length - 1] = 1

    const stack: Array<[number, number]> = [[0, polyline.length - 1]]
    while (stack.length > 0) {
        const [first, last] = stack.pop()!
        if (last <= first + 1) continue

        let furthest = -1
        let furthestDistance = 0
        for (let i = first + 1; i < last; i++) {
            const distance = squaredDistanceToSegment(
                polyline[i],
                polyline[first],
                polyline[last],
                lngScale
            )
            if (distance > furthestDistance) {
                furthestDistance = distance
                furthest = i
            }
        }

        if (furthestDistance > toleranceSquared) {
            keep[furthest] = 1
            stack.push([first, furthest], [furthest, last])
        }
    }

    const simplified: Polyline = []
    for (let i = 0; i < polyline.length; i++) {
        if (keep[i]) simplified.push(polyline[i])
    }
    return simplified
}
