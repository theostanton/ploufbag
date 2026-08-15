import {WindDirection} from "@ploufbag/common";

export type FfvlBalise = {
    nom: string
    idBalise: string,
    latitude: string
    longitude: string
    altitude: string
}
export type FfvlSite = {
    suid: string,
    latitude: string
    longitude: string
    altitude: string
    terrain_polygon: string | undefined
    toponym: string
    flying_functions_text: string | null
}

export type FfvlReport = {
    idbalise: string
    date: string
    vitesseVentMin: string
    vitesseVentMoy: string
    vitesseVentMax: string
    directVentInst: string
    directVentMoy: string
}


export type WindsockReport = {
    idbalise: string
    date: Date
    windKmh: number
    gustKmh: number
    direction: WindDirection
}