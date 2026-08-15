import Link from "next/link";
import {Site} from "@ploufbag/common";
import {formatSiteName} from "../../utils/formatSiteName";

export default function SiteLink({site}: { site: Site }) {
    return <Link href={`/sites/${site.slug}`}>{formatSiteName(site.name)}</Link>
}