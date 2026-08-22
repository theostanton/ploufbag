import {failure, Either, success} from "@model/Either";
import {jwtVerify} from "jose";
import {cookies} from "next/headers";
import {StravaAthleteId} from "@ploufbag/common";

export namespace Auth {

    export async function assert() {
        const _cookies = await cookies();
        console.assert(_cookies.has("sid"), "Is not authed")
    }

    export async function getSelfPilotId(): Promise<StravaAthleteId> {
        await assert()
        const _cookies = await cookies();
        const jwt = _cookies.get('sid').value

        const [pilotId, error] = await verifyJwt(jwt)
        if (error) {
            throw new Error("getSelfPilotId Failed to get pilotId")
        }

        return pilotId
    }


    /**
     * The signed-in pilot, or nothing.
     *
     * `getSelfPilotId` throws when there is no session -- it reads `.value` off
     * a cookie that is not there -- which is right for a protected route and
     * wrong for a public one. Flight, site and pilot pages are all public and
     * still want to know whether the person reading is the owner, so they need
     * the question asked without it being an error to say no.
     */
    export async function getSelfPilotIdOrNull(): Promise<StravaAthleteId | null> {
        const jwt = (await cookies()).get('sid')?.value
        if (!jwt) {
            return null
        }
        const [pilotId, error] = await verifyJwt(jwt)
        return error ? null : pilotId
    }

    export async function checkIsAuthed(): Promise<boolean> {
        const jwt = (await cookies()).get('sid')?.value

        if (jwt) {
            const [_, error] = await verifyJwt(jwt)
            if (error) {
                console.log("checkIsAuthed", error)
                return false
            }
            return true
        } else {
            return false
        }
    }

    async function verifyJwt(sid: string): Promise<Either<number>> {
        if (!process.env.SESSION_SECRET?.length) {
            throw Error('Session Secret required');
        }

        try {
            const secretKey = new TextEncoder().encode(process.env.SESSION_SECRET)

            console.log(`verifyJwt secretKey=${secretKey}`);

            const result = await jwtVerify(sid, secretKey);
            console.log('payload', result.payload);
            return success(result.payload.sub as unknown as number)
        } catch (error) {
            return failure(error.message)
        }
    }
}