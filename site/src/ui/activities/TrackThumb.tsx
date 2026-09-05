import type { LatLng } from '@ploufbag/common'
import styles from './Activities.module.css'

/**
 * A flight's shape, small.
 *
 * "Was this a flight?" is answered by looking at the track, not by reading
 * metadata — a pilot recognises the descent from a launch instantly and does not
 * recognise 4.1 km / 26 min at all. The full map behind the panel would be the
 * richer version of this; a thumbnail on the row is the one that also works on a
 * phone, and that shows twenty at once.
 *
 * Drawn from the track already stored on the activity, so it costs no request.
 */
export default function TrackThumb({
    polyline,
    colour,
    label,
}: {
    polyline: LatLng[] | null
    colour: string
    label: string
}) {
    if (!polyline || polyline.length < 2) {
        return (
            <span className={styles.thumbEmpty} title="No track recorded" aria-hidden="true">
                —
            </span>
        )
    }

    const lats = polyline.map(point => point[0])
    const lngs = polyline.map(point => point[1])
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    // Guard against a degenerate box: a track that never moved would divide by
    // zero and render nothing at all.
    const spanLat = Math.max(maxLat - minLat, 1e-6)
    const spanLng = Math.max(maxLng - minLng, 1e-6)

    const WIDTH = 48
    const HEIGHT = 32
    const PAD = 3

    // One scale for both axes, so the shape is the shape rather than a stretched
    // version of it — a straight glide out and a tight thermalling stack have to
    // stay visibly different.
    const scale = Math.min((WIDTH - PAD * 2) / spanLng, (HEIGHT - PAD * 2) / spanLat)
    const offsetX = (WIDTH - spanLng * scale) / 2
    const offsetY = (HEIGHT - spanLat * scale) / 2

    const points = polyline
        .map(([lat, lng]) => {
            const x = offsetX + (lng - minLng) * scale
            // Latitude increases northward, y increases downward.
            const y = offsetY + (maxLat - lat) * scale
            return `${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(' ')

    const [startLat, startLng] = polyline[0]

    return (
        <svg
            className={styles.thumb}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={label}
        >
            <polyline
                points={points}
                fill="none"
                stroke={colour}
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            {/* Where it started, so the direction of the flight reads. */}
            <circle
                cx={(offsetX + (startLng - minLng) * scale).toFixed(1)}
                cy={(offsetY + (maxLat - startLat) * scale).toFixed(1)}
                r="2"
                fill={colour}
            />
        </svg>
    )
}
