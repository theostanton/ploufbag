import Link from "next/link";
import {Site} from "@ploufbag/common";

export default function TakeoffLink({takeoff}: { takeoff: Site }) {
    return <Link href={`/sites/${takeoff.slug}`}>↗️ {takeoff.name}</Link>
}