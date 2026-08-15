import {expect, test} from "vitest";
import {FFVL} from "./index";

// Hits the live FFVL API and needs a real FFVL_KEY. vitest.config.ts sets
// FFVL_KEY to "", so this can only pass on a machine with a key configured —
// it was an unconditional red in CI. `expect(result[0]).toBe(true)` was also
// nonsense: index 0 of an Either is the value, never a boolean.
const itLive = process.env.FFVL_KEY ? test : test.skip

itLive("FFVL.getReport()", async () => {
    const baliseId = "5026" // Brise vallée de Cham

    const fourHoursAgoMillis = new Date().getTime() - 4 * 60 * 60 * 1000
    const [report, error] = await FFVL.getReport(baliseId, new Date(fourHoursAgoMillis))

    expect(error).toBeUndefined()
    expect(report!.windKmh).toBeTypeOf('number')
    expect(report!.gustKmh).toBeTypeOf('number')
    expect(report!.idbalise).toBeTypeOf('string')
    expect(report!.date.getTime()).toBeTypeOf('number')
    expect(report!.direction.toString().length).toBeGreaterThan(0)
})