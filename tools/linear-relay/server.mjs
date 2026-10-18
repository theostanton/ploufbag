#!/usr/bin/env node
//
// Linear relay for the agent-driven process: keeps each project's status saying
// who it is waiting on, and hands the next [Agent] issue to Cyrus when the issue
// blocking it is resolved. See README.md for the rules and the Mac mini setup.
//
// Configuration (environment, usually from an env file -- see README.md):
//   LINEAR_API_KEY         personal API key; the relay acts as its owner
//   LINEAR_WEBHOOK_SECRET  signing secret of the Linear webhook pointed here
//   CYRUS_USER_ID          Cyrus's Linear app user id (the delegate)
//   PORT                   default 3458
//   SWEEP_MINUTES          status re-check of every managed project; default 10, 0 = off
//   RELAY_DRY_RUN          1 = log what would change, change nothing
//   RELAY_AUTO_DELEGATE    0 = status only, no delegation; default 1

import http from 'node:http';
import { createClient } from './linear.mjs';
import { DEFAULT_NAMES, desiredProjectStatus, issuesToDelegate } from './rules.mjs';
import { SIGNATURE_HEADER, readIssueEvent, verifyWebhook } from './webhook.mjs';

const config = {
    apiKey: process.env.LINEAR_API_KEY,
    secret: process.env.LINEAR_WEBHOOK_SECRET,
    cyrusUserId: process.env.CYRUS_USER_ID,
    port: Number(process.env.PORT || 3458),
    sweepMinutes: Number(process.env.SWEEP_MINUTES ?? 10),
    dryRun: process.env.RELAY_DRY_RUN === '1',
    autoDelegate: process.env.RELAY_AUTO_DELEGATE !== '0',
};

for (const key of ['apiKey', 'secret', 'cyrusUserId']) {
    if (!config[key]) {
        console.error(`missing configuration: ${key} (see tools/linear-relay/README.md)`);
        process.exit(1);
    }
}

const linear = createClient(config.apiKey);
const log = (...parts) => console.log(new Date().toISOString(), ...parts);
const intent = (text) => (config.dryRun ? `[dry run] would ${text}` : text);

let statusIdsByName = null;
async function statusId(name) {
    if (!statusIdsByName) {
        statusIdsByName = new Map(
            (await linear.getProjectStatuses()).map((status) => [status.name.trim().toLowerCase(), status.id])
        );
    }
    const id = statusIdsByName.get(name.trim().toLowerCase());
    if (!id) throw new Error(`no project status named "${name}"`);
    return id;
}

async function reconcileStatus(project) {
    const desired = desiredProjectStatus(project, config.cyrusUserId, DEFAULT_NAMES);
    if (!desired || desired.toLowerCase() === project.status.name.toLowerCase()) return;
    log(`${project.name}: ${intent(`set status ${project.status.name} -> ${desired}`)}`);
    if (!config.dryRun) await linear.setProjectStatus(project.id, await statusId(desired));
}

async function delegateUnblocked(project, resolvedIssueId) {
    for (const issue of issuesToDelegate(project, resolvedIssueId, DEFAULT_NAMES)) {
        log(`${project.name}: ${intent(`delegate ${issue.identifier} to Cyrus`)}`);
        if (!config.dryRun) await linear.delegateIssue(issue.id, config.cyrusUserId);
    }
}

// Events arrive in bursts -- one state change can bring an issue update, a
// relation update and Cyrus's own edits within a second -- so each project is
// handled once per quiet second, with the delegation candidates collected.
const pending = new Map();
function schedule(projectId, resolvedIssueId) {
    const entry = pending.get(projectId) ?? { resolved: new Set(), timer: null };
    if (resolvedIssueId) entry.resolved.add(resolvedIssueId);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
        pending.delete(projectId);
        handleProject(projectId, [...entry.resolved]).catch((error) => log(`project ${projectId}: ${error.message}`));
    }, 1000);
    pending.set(projectId, entry);
}

async function handleProject(projectId, resolvedIssueIds) {
    let project = await linear.getProject(projectId);
    if (!project) return;
    if (config.autoDelegate && resolvedIssueIds.length > 0) {
        for (const issueId of resolvedIssueIds) await delegateUnblocked(project, issueId);
        if (!config.dryRun) project = await linear.getProject(projectId);
    }
    await reconcileStatus(project);
}

async function sweep() {
    const names = [DEFAULT_NAMES.speccing, DEFAULT_NAMES.agentWorking, DEFAULT_NAMES.awaitingHuman];
    for (const projectId of await linear.getProjectIdsInStatuses(names)) {
        await reconcileStatus(await linear.getProject(projectId));
    }
}

function readBody(request, limit = 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error('body too large'));
                request.destroy();
            } else {
                chunks.push(chunk);
            }
        });
        request.on('end', () => resolve(Buffer.concat(chunks)));
        request.on('error', reject);
    });
}

const server = http.createServer(async (request, response) => {
    if (request.method === 'GET') {
        response.writeHead(200).end('linear-relay ok\n');
        return;
    }
    if (request.method !== 'POST') {
        response.writeHead(405).end();
        return;
    }
    let payload;
    try {
        payload = verifyWebhook(await readBody(request), request.headers[SIGNATURE_HEADER], config.secret);
    } catch (error) {
        log(`rejected webhook: ${error.message}`);
        response.writeHead(400).end();
        return;
    }
    // Answer straight away; Linear retries slow deliveries.
    response.writeHead(200).end();

    const event = readIssueEvent(payload);
    if (!event) return;
    for (const projectId of event.projectIds) {
        schedule(projectId, event.stateChanged ? event.issueId : null);
    }
});

// Loopback only: Tailscale Funnel is the one way in.
server.listen(config.port, '127.0.0.1', () => {
    log(
        `linear-relay listening on 127.0.0.1:${config.port}` +
            (config.dryRun ? ' (dry run)' : '') +
            (config.autoDelegate ? '' : ' (status only)')
    );
});

if (config.sweepMinutes > 0) {
    const runSweep = () => sweep().catch((error) => log(`sweep: ${error.message}`));
    setTimeout(runSweep, 5000);
    setInterval(runSweep, config.sweepMinutes * 60 * 1000);
}
