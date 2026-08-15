import {Either, LatLng, Site} from "@parastats/common";
import {failed, success} from "@parastats/common";
import {withPooledClient, Client} from "./client";

export namespace Sites {
    export async function upsert(sites: Site[]): Promise<Either<void>> {
        return withPooledClient(async (database: Client) => {
            try {
                const errors: string[] = []
                for await (const site of sites) {
                    console.log(`Upserting site=${JSON.stringify(site)}`)
                    try {
                        // sites has two unique constraints: ffvl_sid (primary
                        // key) and slug. Conflicts were only handled for
                        // ffvl_sid, so a site whose slug was already held by a
                        // *different* ffvl_sid raised sites_slug_key and was
                        // dropped. That is reachable with real FFVL data: slug
                        // is slugify(toponym), and slugify strips every
                        // non-alphanumeric character, so two distinct sites
                        // sharing a toponym — or differing only by accents or
                        // punctuation — collapse to the same slug.
                        //
                        // Slug uniqueness has to hold: /sites/[site_slug]
                        // resolves a site via Sites.getForSlug, so duplicates
                        // would make that URL ambiguous. Instead the slug is
                        // suffixed with the ffvl_sid when another site already
                        // owns it. Deciding this inside the statement keeps it
                        // atomic — a read-then-write would race — and the
                        // whichever-site-got-there-first keeps the clean URL.
                        await database.query(`
                                    insert into sites(ffvl_sid, slug, name, lat, lng, alt, nearest_balise_id, polygon)
                                    values ($1,
                                            case
                                                when exists (select 1
                                                             from sites
                                                             where slug = $2
                                                               and ffvl_sid <> $1)
                                                    then $2 || '-' || $1
                                                else $2
                                                end,
                                            $3, $4, $5, $6, $7, $8)
                                    on conflict(ffvl_sid)
                                        do update set slug=excluded.slug,
                                                      name=excluded.name,
                                                      lat=excluded.lat,
                                                      lng=excluded.lng,
                                                      alt=excluded.alt,
                                                      nearest_balise_id=excluded.nearest_balise_id,
                                                      polygon=excluded.polygon
                            `,
                            [
                                site.ffvl_sid,
                                site.slug,
                                site.name,
                                site.lat,
                                site.lng,
                                site.alt,
                                site.nearest_balise_id,
                                site.polygon
                            ])
                    } catch (error) {
                        console.log(`Failed:${error}`)
                        errors.push(error!!.toString())
                    }
                }
                if (errors.length > 0) {
                    return failed(`${errors.length} failed: ${errors.join('\n')}`)
                }
                return success(undefined)
            } catch (error) {
                return failed(error!!.toString())
            }
        });
    }


    export async function getIdOfCloset(latLng: LatLng, limitMeters: number | null = null): Promise<string | null> {
        return withPooledClient(async (client: Client) => {
            const query = `select ffvl_sid                   as slug,
                                  distance(lat, lng, $1, $2) as distance_meters
                           from sites
                           order by distance_meters
                           limit 1;`

            type Closest = {
                slug: string
                distance_meters: number
            }

            const [lat, lng] = latLng;
            const result = await client.query<Closest>(query, [lat, lng])

            const closest = result.rows[0].reify()

            if (!closest.slug) {
                return null
            }

            if (limitMeters == null || closest.distance_meters < limitMeters) {
                return closest.slug
            }

            return null
        });
    }
}