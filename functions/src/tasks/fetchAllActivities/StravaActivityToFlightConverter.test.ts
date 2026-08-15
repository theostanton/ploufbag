import {isSuccess} from "@parastats/common";
import {expect, test} from "vitest";
import {StravaActivity, StravaActivityId, StravaAthleteId} from "../../model/stravaApi/model";
import {StravaActivityToFlightConverter} from "./StravaActivityToFlightConverter";
import {TestContainer} from "../../model/database/generateContainer.test";
import {LatLng} from "../../model/database/model";
import {Mocks} from "../../model/database/Mocks.test";

test('StravaActivityToFlightConverter.convert() ', async () => {

    const container = await TestContainer.generateEmpty()

    const pilotId: StravaAthleteId = Math.random()

    const input: StravaActivity = {
        id: Math.random().toString(),
        name: "Theo",
        distance: Math.random(),
        type: "AlpineSki",
        description: "Line one\n🪂 Wing name\nLine two",
        moving_time: Math.random(),
        elapsed_time: Math.random(),
        start_date: new Date(123),
        map: {
            polyline: polylinePlanprazBoisDuBouchet
        }
    }

    const result = await StravaActivityToFlightConverter.convert(pilotId, input)

    expect(result.success).toBe(true)

    if (isSuccess(result)) {
        const value = result.value
        expect(value.pilot_id).toEqual(pilotId)
        expect(value.wing).toEqual("Wing name")
        expect(value.strava_activity_id).toEqual(input.id)
        expect(value.duration_sec).toEqual(input.elapsed_time)
        expect(value.distance_meters).toEqual(input.distance)
        expect(value.start_date).toEqual(input.start_date)
        expect(value.description).toEqual(input.description)
        expect(value.polyline).toEqual(latLngsPlanprazBoisDuBouchet)
        expect(value.takeoff_id).toEqual(Mocks.planpraz.slug)
        expect(value.landing_id).toEqual(Mocks.leBoisDuBouchet.slug)
    }

    await container?.stop()
})

const polylinePlanprazBoisDuBouchet: string = "i}jwGqbyh@lB_@Xc@P_@ZgARa@n@k@T]L]PYPEt@XLCFG^gANWDEVMRERDZf@z@vBJLVFdCSTa@ZkARe@n@eFPmCx@gGDi@RqFF[h@{@Pg@P}@Dm@@YEoAJgCMkBCgCPiBBoB?k@McEI_AE]GMMBIZ@RFJHBLAZu@NcBBcAAsBQyDKaJB_A^{DFsCCMKG[GGKBM^e@p@m@jDuCXSl@[r@OLFDNCD_@?y@JQAICFSZc@nEqEdA}@tA}@ZYfAaBXg@HWDq@CwBo@yBqAwDc@gBM_@Ya@_@]c@Ue@Os@CYD]No@n@u@tAg@b@y@l@GHQb@E^D`@\\\\\\\\h@P`AB\\\\H"
const latLngsPlanprazBoisDuBouchet: LatLng[] = [
    [45.93637, 6.85113], [45.93582, 6.85129], [45.93569, 6.85147],
    [45.9356, 6.85163], [45.93546, 6.85199], [45.93536, 6.85216],
    [45.93512, 6.85238], [45.93501, 6.85253], [45.93494, 6.85268],
    [45.93485, 6.85281], [45.93476, 6.85284], [45.93449, 6.85271],
    [45.93442, 6.85273], [45.93438, 6.85277], [45.93422, 6.85313],
    [45.93414, 6.85325], [45.93411, 6.85328], [45.93399, 6.85335],
    [45.93389, 6.85338], [45.93379, 6.85335], [45.93365, 6.85315],
    [45.93335, 6.85255], [45.93329, 6.85248], [45.93317, 6.85244],
    [45.9325, 6.85254], [45.93239, 6.85271], [45.93225, 6.85309],
    [45.93215, 6.85328], [45.93191, 6.85443], [45.93182, 6.85514],
    [45.93153, 6.85646], [45.9315, 6.85667], [45.9314, 6.85788],
    [45.93136, 6.85802], [45.93115, 6.85832], [45.93106, 6.85852],
    [45.93097, 6.85883], [45.93094, 6.85906], [45.93093, 6.85919],
    [45.93096, 6.85959], [45.9309, 6.86027], [45.93097, 6.86081],
    [45.93099, 6.86149], [45.9309, 6.86202], [45.93088, 6.86258],
    [45.93088, 6.8628], [45.93095, 6.86378], [45.931, 6.8641],
    [45.93103, 6.86425], [45.93107, 6.86432], [45.93114, 6.8643],
    [45.93119, 6.86416], [45.93118, 6.86406], [45.93114, 6.864],
    [45.93109, 6.86398], [45.93102, 6.86399], [45.93088, 6.86426],
    [45.9308, 6.86476], [45.93078, 6.8651], [45.93079, 6.86568],
    [45.93088, 6.86661], [45.93094, 6.86838], [45.93092, 6.8687],
    [45.93076, 6.86964], [45.93072, 6.87038], [45.93074, 6.87045],
    [45.9308, 6.87049], [45.93094, 6.87053], [45.93098, 6.87059],
    [45.93096, 6.87066], [45.9308, 6.87085], [45.93055, 6.87108],
    [45.92969, 6.87183], [45.92956, 6.87193], [45.92933, 6.87207],
    [45.92907, 6.87215], [45.929, 6.87211], [45.92897, 6.87203],
    [45.92899, 6.872], [45.92915, 6.872], [45.92944, 6.87194],
    [45.92953, 6.87195], [45.92958, 6.87197], [45.92954, 6.87207],
    [45.9294, 6.87225], [45.92836, 6.8733], [45.92801, 6.87361],
    [45.92758, 6.87392], [45.92744, 6.87405], [45.92708, 6.87454],
    [45.92695, 6.87474], [45.9269, 6.87486], [45.92687, 6.87511],
    [45.92689, 6.87571], [45.92713, 6.87632], [45.92754, 6.87724],
    [45.92772, 6.87776], [45.92779, 6.87792], [45.92792, 6.87809],
    [45.92808, 6.87824], [45.92826, 6.87835], [45.92845, 6.87843],
    [45.92871, 6.87845], [45.92884, 6.87842],
    [45.92899, 6.87834], [45.92923, 6.8781],
    [45.9295, 6.87767], [45.9297, 6.87749],
    [45.92999, 6.87726], [45.93003, 6.87721],
    [45.93012, 6.87703], [45.93015, 6.87687],
    [45.93012, 6.8767], [45.92997, 6.87655],
    [45.92982, 6.8764], [45.92961, 6.87631],
    [45.92928, 6.87629], [45.92913, 6.87614],
    [45.92908, 6.87613]
]