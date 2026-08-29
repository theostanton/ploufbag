import axios, {AxiosHeaders} from "axios";
import {StravaActivityId, failed, Either, success, Pilots, isSuccess} from "@ploufbag/common";
import {StravaActivity, StravaActivitySummary, StravaAthlete, StravaStreams, isRelevantActivityType} from "@/stravaApi/model";
import {TrackSample} from "@ploufbag/common";

export class StravaApi {

    headers: AxiosHeaders;
    token: string;

    static async fromUserId(userId: number): Promise<StravaApi> {
        const result = await Pilots.getAccessToken(userId);
        if (isSuccess(result)) {
            const [accessToken] = result;
            return new StravaApi(accessToken)
        }
        throw new Error(`No access token for userId=${userId}`)
    }

    static fromAccessToken(token: string): StravaApi {
        return new StravaApi(token)
    }

    private constructor(token: string) {
        this.token = token
        this.headers = new AxiosHeaders();
        this.headers.set('Authorization', `Bearer ${token}`);
        this.headers.set('Content-Type', `application/json`);
    }

    async fetchAthlete(): Promise<StravaAthlete> {
        const response = await axios.get<StravaAthlete>('https://www.strava.com/api/v3/athlete', {headers: this.headers});
        return response.data
    }

    async updateDescription(activityId: StravaActivityId, description: string): Promise<Either<void>> {
        console.log(`Update description ${activityId} to ${description} this.headers=${this.headers}`);
        try {
            const url = `https://www.strava.com/api/v3/activities/${activityId}`;
            console.log(`url=${url}`)
            const response = await axios.put<void>(url,
                {
                    description: description
                },
                {
                    headers: this.headers,
                }
            );
            if (response.status === 200) {
                return success(undefined)
            } else {
                return failed(`updateDescription failed status=${response.status} ${response}`);
            }
        } catch (error) {
            return failed(`updateDescription failed error=${error}`)
        }
    }

    /**
     * Every activity Strava has for this athlete, as summaries.
     *
     * Two hundred per request and no per-activity fetch, which is what makes a
     * six-year history scannable in a couple of seconds rather than a couple of
     * hundred requests. The classifier decides what is a flight from these; the
     * detail endpoint is only worth paying for once something already is one.
     *
     * Every type is returned, deliberately. Which types count as flights is the
     * pilot's answer, not this method's, and the empty state needs to be able to
     * say "you have 340 Hikes" when we found nothing.
     */
    async fetchActivitySummaries(limit: number = 10_000): Promise<Either<StravaActivitySummary[]>> {
        console.log(`fetchActivitySummaries() limit=${limit}`);
        try {
            const summaries: StravaActivitySummary[] = []
            let page = 1
            while (summaries.length < limit) {
                const response = await axios.get<StravaActivitySummary[]>(
                    'https://www.strava.com/api/v3/athlete/activities',
                    { params: { per_page: 200, page }, headers: this.headers }
                );
                summaries.push(...response.data)
                console.log(`fetchActivitySummaries page=${page} got=${response.data.length} total=${summaries.length}`)
                // A short page is the last page. Unlike the id scan below, there
                // is no early exit on already-seen activities: the whole point of
                // a scan is that it is cheap enough to redo in full, and stopping
                // early would leave edited activities stale for ever.
                if (response.data.length < 200) {
                    break
                }
                page++
            }
            return success(summaries.slice(0, limit))
        } catch (error: any) {
            if (error.response?.status === 429) {
                return failed('Rate limited');
            }
            return failed(`fetchActivitySummaries failed: ${error.message || error.toString()}`)
        }
    }

    async fetchParaglidingActivityIds(limit: number = 10000, ignoreActivityIds: StravaActivityId[] = []): Promise<Either<StravaActivityId[]>> {
        console.log(`fetchWingedActivityIds() limit=${limit} ignoreActivityIds=${ignoreActivityIds}`);
        try {
            let relevantActivityIds: StravaActivityId[] = []
            let moreToFetch = true
            let page = 1
            while (moreToFetch && relevantActivityIds.length < limit) {
                const params: Record<string, any> = {
                    per_page: 200,
                    page: page
                }
                console.log(`Fetching page=${page}`)
                const response = await axios.get<StravaActivitySummary[]>('https://www.strava.com/api/v3/activities', {
                    params,
                    headers: this.headers
                });

                const relevantActivityIdsToAppend = response.data
                    .filter(activity => isRelevantActivityType(activity.type))
                    .map(activity => activity.id);
                console.log(`Got page=${page} activities=${response.data.length} relevantActivityIds=${relevantActivityIdsToAppend.length}`);
                let allIgnored = true
                relevantActivityIdsToAppend.forEach((relevantActivityId, index) => {
                    const shouldIgnore = ignoreActivityIds.filter(ignoreActivityId => relevantActivityId == ignoreActivityId).length > 0

                    if (shouldIgnore) {
                        console.log(`${index + 1}/${relevantActivityIdsToAppend.length} Ignoring relevantActivityId=${relevantActivityId}`)
                    } else {
                        allIgnored = false
                        console.log(`${index + 1}/${relevantActivityIdsToAppend.length} Appending relevantActivityId=${relevantActivityId}`)
                        relevantActivityIds.push(relevantActivityId);
                    }
                })
                moreToFetch = !allIgnored && response.data.length == 200
                page++
            }

            return success(relevantActivityIds)
        } catch (err) {
            // @ts-ignore
            return failed(err.toString())
        }

    }

    async fetchActivity(activityId: StravaActivityId): Promise<Either<StravaActivity>> {
        console.log(`fetchActivity() activityId=${activityId}`);
        try {
            const response = await axios.get<StravaActivity>(`https://www.strava.com/api/v3/activities/${activityId}`, {
                headers: this.headers
            });

            if (response.status === 200) {
                return success(response.data);
            } else {
                return failed(`fetchActivity failed status=${response.status}`);
            }
        } catch (error: any) {
            if (error.response?.status === 429) {
                return failed('Rate limited');
            }
            return failed(`fetchActivity failed: ${error.message || error.toString()}`);
        }
    }

    /**
     * The track with its clock: what turns a shape into a flight with a start
     * and an end.
     *
     * Neither the list nor the detail endpoint carries timestamps -- a polyline
     * is positions and nothing else -- so working out when the pilot was
     * actually airborne, rather than walking around at launch with the vario
     * running, needs this third request. It is the only reason to spend it, and
     * callers are expected to ask first whether the activity looks like it has
     * ground time in it.
     *
     * Missing streams are a success with nothing in them, not a failure. An
     * activity with no GPS is ordinary, and the callers all have a path that
     * works without a track; only a rate limit is worth stopping a batch for.
     */
    async fetchActivityStreams(activityId: StravaActivityId): Promise<Either<TrackSample[]>> {
        console.log(`fetchActivityStreams() activityId=${activityId}`);
        try {
            const response = await axios.get<StravaStreams>(
                `https://www.strava.com/api/v3/activities/${activityId}/streams`,
                {
                    headers: this.headers,
                    params: {keys: 'time,latlng,altitude', key_by_type: true},
                }
            );

            if (response.status !== 200) {
                return failed(`fetchActivityStreams failed status=${response.status}`);
            }

            const times = response.data?.time?.data
            const points = response.data?.latlng?.data
            const altitudes = response.data?.altitude?.data

            if (!times || !points || times.length !== points.length) {
                return success([]);
            }

            const samples: TrackSample[] = []
            for (let i = 0; i < times.length; i++) {
                const point = points[i]
                if (!point || point.length !== 2) {
                    continue
                }
                samples.push({
                    timeSec: times[i],
                    point: [point[0], point[1]],
                    altitudeMetres: altitudes?.[i] ?? null,
                })
            }
            return success(samples);
        } catch (error: any) {
            if (error.response?.status === 429) {
                return failed('Rate limited');
            }
            if (error.response?.status === 404) {
                // Nothing recorded, which is a fact about the activity rather
                // than something going wrong.
                return success([]);
            }
            return failed(`fetchActivityStreams failed: ${error.message || error.toString()}`);
        }
    }

}