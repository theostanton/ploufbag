import jwt from "jsonwebtoken";
import {Request, Response} from "express";
import {Pilots, PilotRow, failed, Either, success, isSuccess} from "@parastats/common";

export function generateJwt(userId: number): string {
    console.log(`generateJwt process.env.SESSION_SECRET=${process.env.SESSION_SECRET}`)
    return jwt.sign(
        {sub: userId, typ: 'session'},
        process.env.SESSION_SECRET!,
        {expiresIn: '7d', algorithm: 'HS256'}
    );

}

export function sign(userId: number, res: Response): string {
    console.log(`sign process.env.SESSION_SECRET=${process.env.SESSION_SECRET}`)

    const jwtToken = generateJwt(userId)

    // Scoped to the apex domain, not the subdomain that sets it: this runs on
    // webhooks.<domain> but the cookie has to be readable by the site on the apex.
    //
    // Empty/unset means omit the Domain attribute entirely, producing a host-only
    // cookie. That is required for localhost, which browsers refuse to accept as a
    // Domain value — passing domain: "" to res.cookie would send `Domain=`, so the
    // property has to be absent rather than blank.
    const cookieDomain = process.env.COOKIE_DOMAIN;
    res.cookie('sid', jwtToken, {
        ...(cookieDomain ? {domain: cookieDomain} : {}),
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        maxAge: 2 * 60 * 60 * 1000 // 2 hours
    });

    return jwtToken
}

export async function verifyJwt(req: Request, res: Response): Promise<Either<PilotRow>> {

    if (!process.env.SESSION_SECRET?.length) {
        throw new Error('Session Secret required');
    }

    try {
        console.log(`verifyJwt`);

        const payload = jwt.verify(req.cookies.sid, process.env.SESSION_SECRET!);
        const userId = payload.sub as unknown as number
        console.log(`verifyJwt userId ${userId}`);
        const result = await Pilots.get(userId);
        console.log('result', result);
        if (isSuccess(result)) {
            const [pilot] = result;
            return success(pilot)
        }
        res.status(401).end()
    } catch {
        res.status(401).end();
    }
    return failed("401")
}

export async function extractPilotFromJwt(req: Request): Promise<PilotRow> {
    const payload = jwt.verify(req.cookies.sid, process.env.SESSION_SECRET!);
    const userId = payload.sub as unknown as number
    const result = await Pilots.get(userId);
    if (isSuccess(result)) {
        const [pilot] = result;
        return pilot
    }
    throw "Tried to extractUserFromJwt on unverified jwt"
}