import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Nothing in the client graph may import a *value* from the `@ploufbag/common`
 * barrel.
 *
 * The barrel re-exports ./database -- ts-postgres and generic-pool -- and common
 * compiles to CommonJS with no sideEffects flag, so no bundler can shake that
 * back out. One value import anywhere a client component can reach puts Node's
 * `net` into the browser bundle, where it fails to resolve, hydration throws,
 * and the route renders its error boundary.
 *
 * /flights and /sites were broken exactly that way from 22 August. Nothing
 * caught it: the server-rendered HTML is perfect, so curl and every existing
 * test saw a working page, and the failure only appears once a browser runs the
 * JavaScript. siteRole.ts carried a comment warning about this; colors.ts three
 * lines away did it anyway.
 *
 * Type-only imports are erased by the compiler and stay allowed. Values come
 * from the leaf module instead -- `@ploufbag/common/dist/trackColours` -- which
 * pulls in nothing but itself.
 *
 * The graph is walked from every `'use client'` file rather than checking a
 * directory, because the file that actually broke the site had no directive of
 * its own: it was a plain module three imports down from one that did.
 */

const SITE_ROOT = path.resolve(__dirname, '../..')

/**
 * One import statement: an optional `type` marker, its bindings, and the module.
 *
 * The bindings are a brace group or a bare identifier, never arbitrary text.
 * With `[\s\S]*?` there instead, a match starts at one import statement and ends
 * at the `from` of a later one -- so a file whose first import is from 'react'
 * reads as importing react's bindings from wherever the next `from` points. That
 * mis-read this test in both directions until it was pinned.
 */
const IMPORT_STATEMENT =
    /import\s+(type\s+)?(?:\{[^}]*\}|[A-Za-z0-9_$*]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+['"]([^'"]+)['"]/g

/** The subset of tsconfig paths that can reach browser code. */
const ALIASES: Record<string, string> = {
    '@model/': 'src/data/model/',
    '@database/': 'src/data/database/',
    '@auth/': 'src/data/auth/',
    '@ui/': 'src/ui/',
    '@utils/': 'src/utils/',
    '@actions/': 'src/app/actions/',
}

function allSources(dir: string = 'src'): string[] {
    const full = path.join(SITE_ROOT, dir)
    if (!fs.existsSync(full)) return []
    return fs.readdirSync(full, { withFileTypes: true }).flatMap(entry => {
        const child = path.posix.join(dir, entry.name)
        if (entry.isDirectory()) return allSources(child)
        return /\.tsx?$/.test(entry.name) ? [child] : []
    })
}

/** A specifier resolved to a file in this package, or null if it leaves it. */
function resolveImport(fromFile: string, specifier: string): string | null {
    let candidate: string | null = null

    if (specifier.startsWith('.')) {
        candidate = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier))
    } else {
        for (const [alias, target] of Object.entries(ALIASES)) {
            if (specifier.startsWith(alias)) {
                candidate = target + specifier.slice(alias.length)
                break
            }
        }
    }
    if (!candidate) return null

    for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
        const attempt = candidate + suffix
        if (attempt.endsWith('.ts') || attempt.endsWith('.tsx')) {
            if (fs.existsSync(path.join(SITE_ROOT, attempt))) return attempt
        }
    }
    return null
}

/**
 * The specifiers that actually reach the bundle from this file.
 *
 * `import type` statements are erased by the compiler, so following them would
 * invent edges into server-only modules that the browser never sees.
 */
function importsOf(file: string): string[] {
    const source = fs.readFileSync(path.join(SITE_ROOT, file), 'utf8')
    return [...source.matchAll(new RegExp(IMPORT_STATEMENT.source, 'g'))]
        .filter(match => !match[1])
        .map(match => match[2])
}

/**
 * A server action is compiled server-side and referenced from the client by a
 * stub, so importing one puts none of its module graph in the browser. Without
 * this the walk wanders into every action and flags the database imports that
 * are perfectly correct there.
 */
function isServerOnly(file: string): boolean {
    return /^\s*['"]use server['"]/m.test(fs.readFileSync(path.join(SITE_ROOT, file), 'utf8'))
}

/** Every file a client component can reach, the client components included. */
function clientGraph(): Set<string> {
    const sources = allSources()
    const seen = new Set<string>()
    const queue = sources.filter(file =>
        /^\s*['"]use client['"]/m.test(fs.readFileSync(path.join(SITE_ROOT, file), 'utf8'))
    )

    while (queue.length > 0) {
        const file = queue.shift()!
        if (seen.has(file)) continue
        seen.add(file)
        for (const specifier of importsOf(file)) {
            const resolved = resolveImport(file, specifier)
            if (resolved && !seen.has(resolved) && !isServerOnly(resolved)) {
                queue.push(resolved)
            }
        }
    }
    return seen
}

/** Value imports from the barrel in one file, ignoring type-only ones. */
function barrelValueImports(file: string): string[] {
    const source = fs.readFileSync(path.join(SITE_ROOT, file), 'utf8')
    const pattern =
        /import\s+(?!type\s)(\{[^}]*\}|[A-Za-z0-9_$*]+)\s+from\s+['"]@ploufbag\/common['"]/g

    return [...source.matchAll(pattern)]
        .filter(match => {
            const bindings = match[1].trim()
            if (!bindings.startsWith('{')) return true // default or namespace import
            return bindings
                .slice(1, -1)
                .split(',')
                .some(binding => binding.trim() && !binding.trim().startsWith('type '))
        })
        .map(match => match[0].replace(/\s+/g, ' ').trim())
}

describe('the client bundle', () => {
    it('reaches no value in the @ploufbag/common barrel', () => {
        const offenders = [...clientGraph()]
            .sort()
            .flatMap(file => barrelValueImports(file).map(statement => `${file}: ${statement}`))

        expect(
            offenders,
            'Import the value from its leaf module instead, e.g. ' +
            "'@ploufbag/common/dist/trackColours'. See site/src/ui/map/colors.ts."
        ).toEqual([])
    })

    it('walks far enough to have caught the file that actually broke', () => {
        // colors.ts carries no 'use client' of its own -- MapLegend imports it.
        // If the walk ever stops reaching it, the test above is decorative.
        expect(clientGraph()).toContain('src/ui/map/colors.ts')
    })
})
