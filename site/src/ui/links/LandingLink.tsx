import Link from "next/link";
import {Site} from "@ploufbag/common";

export default function LandingLink({landing}: { landing: Site }) {
    return <Link href={`/sites/${landing.slug}`}>↘️ {landing.name}</Link>
}