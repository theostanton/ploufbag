import Link from "next/link";
import {StravaAthleteId} from "@ploufbag/common";

export default function WingLink({wing, pilotId}: { wing: string, pilotId: StravaAthleteId }) {
    return <Link href={`/pilots/${pilotId}/${wing}`}>🪂 {wing}</Link>
}