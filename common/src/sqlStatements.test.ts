import { describe, expect, it } from 'vitest'
import { splitStatements } from './sqlStatements'

/**
 * Where a semicolon is and is not the end of a statement.
 *
 * The cases below are the ones that actually broke: a file written for psql
 * with nineteen statements in it, and a plpgsql body whose semicolons belong to
 * the function rather than to the file.
 */

describe('splitting a SQL file into statements', () => {
    it('splits on plain semicolons', () => {
        expect(splitStatements('select 1; select 2;')).toEqual(['select 1', 'select 2'])
    })

    it('treats a run of semicolons as one separator, so ;;; still works', () => {
        expect(splitStatements('select 1;;;select 2')).toEqual(['select 1', 'select 2'])
    })

    it('keeps a dollar-quoted body whole, semicolons and all', () => {
        const sql = `
do
$verdict$
    begin
        if not exists (select 1 from pg_type where typname = 'activity_verdict') then
            create type activity_verdict as enum ('flight', 'unsure', 'not_flight');
        end if;
    end;
$verdict$;
create table t (id int);
`
        const statements = splitStatements(sql)

        expect(statements).toHaveLength(2)
        expect(statements[0]).toContain('create type activity_verdict')
        expect(statements[0]).toContain('$verdict$')
        expect(statements[1]).toBe('create table t (id int)')
    })

    it('ignores a semicolon inside a string', () => {
        const statements = splitStatements("insert into t values ('a;b'); select 1")

        expect(statements).toEqual(["insert into t values ('a;b')", 'select 1'])
    })

    it('ignores a semicolon inside a quoted identifier', () => {
        expect(splitStatements('select "od;d" from t; select 2')).toEqual([
            'select "od;d" from t',
            'select 2',
        ])
    })

    it('survives a doubled quote inside a string', () => {
        const statements = splitStatements("select 'it''s; fine'; select 2")

        expect(statements).toEqual(["select 'it''s; fine'", 'select 2'])
    })

    it('ignores a semicolon inside a line comment', () => {
        const statements = splitStatements('-- one; two\nselect 1;\nselect 2')

        expect(statements).toHaveLength(2)
        expect(statements[0]).toContain('select 1')
    })

    it('ignores a semicolon inside a block comment', () => {
        const statements = splitStatements('/* one; two */ select 1; select 2')

        expect(statements).toHaveLength(2)
    })

    it('drops a trailing block of comments rather than sending it as a statement', () => {
        // Postgres tolerates an empty query, but it is noise in any failure that
        // follows -- and every script in the manifest ends in prose.
        expect(splitStatements('select 1;\n-- and that is why\n')).toEqual(['select 1'])
    })

    it('returns nothing for a file with no statements in it', () => {
        expect(splitStatements('-- just a note\n')).toEqual([])
        expect(splitStatements('')).toEqual([])
    })
})
