/**
 * One SQL file, as the individual statements it contains.
 *
 * psql takes a whole file and sorts the statements out itself, which is what
 * scripts/migrate.sh and dev/db.sh rely on. ts-postgres cannot: it speaks the
 * extended query protocol, where a prepared statement holds exactly one
 * command, and handing it two raises "cannot insert multiple commands into a
 * prepared statement".
 *
 * Both test suites build their database through ts-postgres, and both used to
 * dodge the problem by loading only the scripts that separate statements with
 * `;;;`. That stopped being true the moment they started loading the whole
 * manifest -- create_monitoring_tables alone is nineteen statements in one
 * chunk -- and the suites failed on every file written for psql instead.
 *
 * So this splits on semicolons for real, which means knowing where a semicolon
 * is *not* a separator: inside a string, inside a comment, and inside the
 * dollar-quoted body of a plpgsql block. That last one is why the `;;;`
 * convention was invented in the first place. Runs of semicolons collapse, so
 * files using `;;;` still split exactly as they did.
 *
 * Lives here rather than in either package because both need it, and a splitter
 * that exists twice is a splitter that will disagree with itself.
 */
export function splitStatements(sql: string): string[] {
    const statements: string[] = []
    let current = ''
    let index = 0

    /** Copy everything up to `end` verbatim, separators inside it included. */
    const take = (end: number) => {
        current += sql.slice(index, end)
        index = end
    }

    while (index < sql.length) {
        const rest = sql.slice(index)

        if (rest.startsWith('--')) {
            const newline = sql.indexOf('\n', index)
            take(newline === -1 ? sql.length : newline + 1)
            continue
        }
        if (rest.startsWith('/*')) {
            const close = sql.indexOf('*/', index + 2)
            take(close === -1 ? sql.length : close + 2)
            continue
        }

        const character = sql[index]

        if (character === "'" || character === '"') {
            let cursor = index + 1
            while (cursor < sql.length) {
                if (sql[cursor] === character) {
                    // A doubled quote is an escaped one, not the end.
                    if (sql[cursor + 1] === character) {
                        cursor += 2
                        continue
                    }
                    break
                }
                cursor++
            }
            take(Math.min(cursor + 1, sql.length))
            continue
        }

        const dollarTag = /^\$[A-Za-z_]*\$/.exec(rest)
        if (dollarTag) {
            const tag = dollarTag[0]
            const close = sql.indexOf(tag, index + tag.length)
            take(close === -1 ? sql.length : close + tag.length)
            continue
        }

        if (character === ';') {
            statements.push(current)
            current = ''
            index++
            while (sql[index] === ';') {
                index++
            }
            continue
        }

        current += character
        index++
    }
    statements.push(current)

    // A trailing run of comments is not a statement. Postgres tolerates being
    // sent one, but it is noise in whatever failure comes next.
    return statements
        .map(statement => statement.trim())
        .filter(statement => statement.length > 0 && containsSql(statement))
}

function containsSql(statement: string): boolean {
    return statement
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--[^\n]*/g, '')
        .trim()
        .length > 0
}
