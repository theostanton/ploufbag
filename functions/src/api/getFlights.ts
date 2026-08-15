import {Request, Response} from "express";
import {extractPilotFromJwt} from "@/jwt";
import {Flights, isSuccess} from "@ploufbag/common";

export async function getFlights(req: Request, res: Response) {

    console.log("getFlights")
    const pilot = await extractPilotFromJwt(req)
    console.log("getFlights pilot=", pilot)

    const result = await Flights.getAll(pilot.pilot_id)
    console.log("getFlights result=", result)

    if (isSuccess(result)) {
        const [flights] = result;
        const sanitised = JSON.parse(JSON.stringify(flights, (_, v) =>
            typeof v === "bigint" ? v.toString() : v,
        ))
        res.status(200).json(sanitised);
    } else {
        const [, error] = result;
        res.status(400).json({error})
    }
}