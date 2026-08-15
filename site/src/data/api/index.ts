import axios from "axios";
import {Either} from "@model/Either";
import {Pilot} from "@ploufbag/common";

type BaseResponse = {
    success: boolean
}

type GetSelfResponse = BaseResponse & {
    user: Pilot | undefined
}

export class ParastatsApi {

    jwtToken: string

    constructor(jwtToken: string) {
        this.jwtToken = jwtToken;
    }

    // baseUrl = process.env.API_URL;
    baseUrl = "http://api:81";

    async getSelf(): Promise<Either<Pilot>> {
        console.log(`getSelf baseUrl=${this.baseUrl}`)

        const response = await axios.get<GetSelfResponse>(this.baseUrl,
            {
                withCredentials: true,
                headers: {cookie: `sid=${this.jwtToken}`}
            }
        )
        console.log("response.data", JSON.stringify(response.data))
        if (response.status != 200) {
            return [undefined, `Error: ${response.status}`]
        } else if (response.data.user == undefined) {
            return [undefined, `Error: user is undefined`]
        } else {
            return [response.data.user, undefined]
        }
    }

    async getActivities(): Promise<Either<Pilot>> {
        console.log(`getActivities baseUrl=${this.baseUrl}`)
        const response = await axios.get<GetSelfResponse>(`${this.baseUrl}/activities`,
            {
                withCredentials: true,
                headers: {cookie: `sid=${this.jwtToken}`}
            }
        )
        console.log("response.data", JSON.stringify(response.data))
        if (response.status != 200) {
            return [undefined, `Error: ${response.status}`]
        } else if (response.data.user == undefined) {
            return [undefined, `Error: user is undefined`]
        } else {
            return [response.data.user, undefined]
        }
    }
}