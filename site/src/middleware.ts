import {NextRequest, NextResponse} from 'next/server'
import {Auth} from "./data/auth";

export default async function middleware(req: NextRequest) {

    console.log('middleware()')

    const path = req.nextUrl.pathname
    const isProtectedRoute = path.startsWith('/dashboard')
        || path.startsWith('/welcome')
        // Somebody else's activities are none of your business, including the
        // ones we decided were not flights.
        || path.startsWith('/activities')
    const isPublicRoute = !isProtectedRoute

    // x-pathname was set here purely so Header could tell whether it was on the
    // home page and hide its nav there. The nav is unconditional now, and Header
    // was the only reader, so the header itself went with it.
    const response = NextResponse.next()

    if (isPublicRoute) {
        console.log('middleware() isPublicRoute')
        return response
    }

    const isAuthed = await Auth.checkIsAuthed()
    console.log('isAuthed', isAuthed)

    if (!isAuthed) {
        console.log('middleware() isProtectedRoute && !isAuthed')
        return NextResponse.redirect(new URL('/login', req.nextUrl))
    }

    console.log('middleware() isProtectedRoute && isAuthed')
    return response
}

// Routes Middleware should not run on
export const config = {
    matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}