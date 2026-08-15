import {Either, Windsock} from "@ploufbag/common";
import {failed, success} from "@ploufbag/common";
import {withPooledClient, Client} from "./client";

export namespace Windsocks {
    export async function upsert(windsocks: Windsock[]): Promise<Either<void>> {
        return withPooledClient(async (database: Client) => {
            try {
                const errors: string[] = []
                for await (const windsock of windsocks) {
                    console.log(`Upserting windsock=${JSON.stringify(windsock)}`)
                    try {
                        await database.query(`
                                    insert into windsocks(balise_id, name, lat, lng, alt)
                                    values ($1, $2, $3, $4, $5)
                                    on conflict(balise_id)
                                        do update set name=$6,
                                                      lat=$7,
                                                      lng=$8,
                                                      alt=$9
                            `,
                            [
                                windsock.balise_id,
                                windsock.name,
                                windsock.lat,
                                windsock.lng,
                                windsock.alt,

                                windsock.name,
                                windsock.lat,
                                windsock.lng,
                                windsock.alt,
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
}