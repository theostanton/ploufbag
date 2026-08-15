import {Either, failure, success, WindDirection} from "@ploufbag/common";
import axios from "axios";
import {FfvlReport, WindsockReport} from "@/ffvlApi/model";

export namespace FFVL {

    export const BaseUrl = "https://data.ffvl.fr/api"

    const Half = 45 / 2
    const NorthDegrees = 0
    const NorthEastDegrees = 45
    const EastDegrees = 90
    const SouthEastDegrees = 135
    const SouthDegrees = 180
    const SouthWestDegrees = 225
    const WestDegrees = 270
    const NorthWestDegrees = 315

    function convertToWindsockDirection(degrees: number): WindDirection {
        if (degrees < NorthDegrees + Half) {
            return WindDirection.N
        }
        if (degrees < NorthEastDegrees + Half) {
            return WindDirection.NE
        }
        if (degrees < EastDegrees + Half) {
            return WindDirection.E
        }
        if (degrees < SouthEastDegrees + Half) {
            return WindDirection.SE
        }
        if (degrees < SouthDegrees + Half) {
            return WindDirection.S
        }
        if (degrees < SouthWestDegrees + Half) {
            return WindDirection.SW
        }
        if (degrees < WestDegrees + Half) {
            return WindDirection.W
        }
        if (degrees < NorthWestDegrees + Half) {
            return WindDirection.NW
        }
        return WindDirection.N
    }

    function convertToWindsockReport(ffvlReport: FfvlReport): WindsockReport {
        const direction = parseInt(ffvlReport.directVentMoy)
        const date = new Date(ffvlReport.date)
        return {
            idbalise: ffvlReport.idbalise,
            windKmh: parseInt(ffvlReport.vitesseVentMoy),
            gustKmh: parseInt(ffvlReport.vitesseVentMax),
            direction: convertToWindsockDirection(direction),
            date,
        }
    }

    export async function getReport(baliseId: string, date: Date): Promise<Either<WindsockReport>> {

        const now = new Date()
        const hours = (now.getTime() - date.getTime()) / (60 * 60 * 1000);

        console.log(`getReport date=${date} hours=${hours}`)

        if (hours > 72) {
            return failure(`Flight was too many hours ago hours=${hours}`)
        }

        const response = await axios.get<FfvlReport[]>(BaseUrl, {
            params: {
                base: "balises",
                idbalise: baliseId,
                r: "histo",
                hours: Math.max(72, hours + 5),
                mode: "json",
                key: process.env.FFVL_KEY
            },
            timeout: 10000
        })

        let closest: [FfvlReport, number] | null = null
        for (const report of response.data) {
            const localDate = new Date(report.date)
            const reportDateUtc = new Date(localDate.getTime() - 2 * 60 * 60 * 1000)
            const diffMillis = Math.abs(reportDateUtc.getTime() - date.getTime())
            console.log(`getReport diffMillis=${diffMillis} reportDate=${reportDateUtc}`)
            if (diffMillis < 30 * 60 * 1000 && (closest == null || diffMillis < closest[1])) {
                closest = [report, diffMillis]
            }
        }


        if (closest == null) {
            return failure("Couldn't get a close enough report")
        }
        console.log(`getReport closest diffMillis=${closest[1]} report=${JSON.stringify(closest[0])}`)

        const value = convertToWindsockReport(closest[0])
        return success(value)
    }
}