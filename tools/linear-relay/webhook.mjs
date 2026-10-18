//
// Linear webhook verification: an HMAC-SHA256 of the raw body, hex, in the
// linear-signature header, and a webhookTimestamp inside the signed body that
// must be within a minute -- the same checks as @linear/sdk's
// LinearWebhookClient, without the dependency.

import crypto from 'node:crypto';

export const SIGNATURE_HEADER = 'linear-signature';
const MAX_AGE_MS = 60 * 1000;

/** Returns the parsed payload, or throws if the signature or timestamp is bad. */
export function verifyWebhook(rawBody, signature, secret, now = Date.now()) {
    if (!signature) throw new Error('missing signature');
    const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
    const given = Buffer.from(String(signature));
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
        throw new Error('bad signature');
    }
    const payload = JSON.parse(rawBody.toString('utf8'));
    const timestamp = payload.webhookTimestamp;
    if (typeof timestamp !== 'number' || Math.abs(now - timestamp) > MAX_AGE_MS) {
        throw new Error('stale or missing webhookTimestamp');
    }
    return payload;
}

/**
 * What an Issue event means to the relay: which project to reconcile, and
 * whether the issue just changed state (the only time delegation is considered).
 */
export function readIssueEvent(payload) {
    if (payload.type !== 'Issue' || !payload.data) return null;
    const projectIds = new Set([payload.data.projectId, payload.updatedFrom?.projectId].filter(Boolean));
    return {
        issueId: payload.data.id,
        projectIds: [...projectIds],
        stateChanged: payload.action === 'update' && Boolean(payload.updatedFrom && 'stateId' in payload.updatedFrom),
    };
}
