import {Metadata} from "next";
import {BRAND_NAME} from "@ui/brand";

export function createMetadata(subtitle: string = null): Metadata {
    return {
        title: subtitle ? `${BRAND_NAME} • ${subtitle}` : BRAND_NAME,
        icons: './favicon.ico',
    }
}
