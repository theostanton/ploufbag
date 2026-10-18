// node --test tools/linear-relay/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { desiredProjectStatus, issuesToDelegate } from './rules.mjs';
import { readIssueEvent, verifyWebhook } from './webhook.mjs';

const CYRUS = 'cyrus-user';

const STATES = {
    backlog: { name: 'Backlog', type: 'backlog' },
    todo: { name: 'Todo', type: 'unstarted' },
    inProgress: { name: 'In Progress', type: 'started' },
    needsHuman: { name: 'Needs Human', type: 'started' },
    codeReview: { name: 'In Code Review', type: 'started' },
    done: { name: 'Done', type: 'completed' },
    canceled: { name: 'Canceled', type: 'canceled' },
};

/** The start of the template's chain, linked as Review spec for gaps links it. */
function pilotProject({ status = 'Agent Working', states = {}, delegates = {}, extra = [] } = {}) {
    const chain = [
        ['spec', 'Human'],
        ['review', 'Agent'],
        ['approve', 'Human'],
        ['research', 'Agent'],
        ['decide', 'Human'],
        ['brief', 'Agent'],
    ];
    const issues = chain.map(([id, executor], index) => ({
        id,
        identifier: `PLOUF-${10 + index}`,
        parentId: null,
        state: STATES[states[id] ?? 'backlog'],
        labels: [executor],
        delegateId: delegates[id] ?? null,
        blockedBy: index > 0 ? [chain[index - 1][0]] : [],
        blocks: index < chain.length - 1 ? [chain[index + 1][0]] : [],
    }));
    return { id: 'p', name: 'Pilot', status: { id: 's', name: status }, issues: [...issues, ...extra] };
}

test('agent working while a delegated issue is in progress', () => {
    const project = pilotProject({
        status: 'Speccing',
        states: { spec: 'done', review: 'inProgress' },
        delegates: { review: CYRUS },
    });
    assert.equal(desiredProjectStatus(project, CYRUS), 'Agent working');
});

test('awaiting human once the agent is done and a gate is unblocked', () => {
    const project = pilotProject({
        states: { spec: 'done', review: 'done' },
        delegates: { review: CYRUS },
    });
    assert.equal(desiredProjectStatus(project, CYRUS), 'Awaiting Human');
});

test('awaiting human while the agent waits in Needs Human or code review', () => {
    for (const state of ['needsHuman', 'codeReview']) {
        const project = pilotProject({
            states: { spec: 'done', review: state },
            delegates: { review: CYRUS },
        });
        assert.equal(desiredProjectStatus(project, CYRUS), 'Awaiting Human', state);
    }
});

test('a delegated issue that has not started yet counts as agent work', () => {
    const project = pilotProject({
        status: 'Awaiting Human',
        states: { spec: 'done', review: 'done', approve: 'done', research: 'todo' },
        delegates: { research: CYRUS },
    });
    assert.equal(desiredProjectStatus(project, CYRUS), 'Agent working');
});

test('speccing is kept while Theo is writing the spec', () => {
    const project = pilotProject({ status: 'Speccing' });
    assert.equal(desiredProjectStatus(project, CYRUS), null);
});

test('statuses outside the managed three are never touched', () => {
    for (const status of ['Idea', 'Shipped', 'Canceled']) {
        const project = pilotProject({ status, states: { review: 'inProgress' }, delegates: { review: CYRUS } });
        assert.equal(desiredProjectStatus(project, CYRUS), null, status);
    }
});

test('status names match case-insensitively', () => {
    const project = pilotProject({
        status: 'awaiting human',
        states: { spec: 'done', review: 'inProgress' },
        delegates: { review: CYRUS },
    });
    assert.equal(desiredProjectStatus(project, CYRUS), 'Agent working');
});

test('closing a gate delegates the agent issue it unblocks', () => {
    const project = pilotProject({ states: { spec: 'done', review: 'done', approve: 'done' } });
    assert.deepEqual(issuesToDelegate(project, 'approve').map((issue) => issue.id), ['research']);
});

test('canceling a gate counts as resolving it (research depth: Skip)', () => {
    const project = pilotProject({
        states: { spec: 'done', review: 'done', approve: 'done', research: 'canceled', decide: 'canceled' },
    });
    assert.deepEqual(issuesToDelegate(project, 'decide').map((issue) => issue.id), ['brief']);
});

test('nothing is delegated while another blocker is still open', () => {
    const project = pilotProject({ states: { spec: 'done', review: 'done', approve: 'done' } });
    project.issues.find((issue) => issue.id === 'research').blockedBy.push('other');
    project.issues.push({
        id: 'other', identifier: 'PLOUF-99', parentId: null, state: STATES.todo,
        labels: ['Human'], delegateId: null, blockedBy: [], blocks: ['research'],
    });
    assert.deepEqual(issuesToDelegate(project, 'approve'), []);
});

test('already delegated, started, human, or sub-issues are left alone', () => {
    const base = { states: { spec: 'done', review: 'done', approve: 'done' } };

    const delegated = pilotProject({ ...base, delegates: { research: CYRUS } });
    assert.deepEqual(issuesToDelegate(delegated, 'approve'), []);

    const started = pilotProject({ ...base, states: { ...base.states, research: 'inProgress' } });
    assert.deepEqual(issuesToDelegate(started, 'approve'), []);

    const sub = pilotProject(base);
    sub.issues.find((issue) => issue.id === 'research').parentId = 'parent';
    assert.deepEqual(issuesToDelegate(sub, 'approve'), []);

    const human = pilotProject({ states: { spec: 'done', review: 'done' } });
    assert.deepEqual(issuesToDelegate(human, 'review'), [], 'the next issue is a [Human] gate');
});

test('an issue that is not resolved delegates nothing', () => {
    const project = pilotProject({ states: { spec: 'done', review: 'done', approve: 'inProgress' } });
    assert.deepEqual(issuesToDelegate(project, 'approve'), []);
});

const SECRET = 'whsec_test';
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('hex');

test('a correctly signed, fresh webhook is accepted', () => {
    const body = Buffer.from(JSON.stringify({ type: 'Issue', webhookTimestamp: 1_000_000 }));
    assert.equal(verifyWebhook(body, sign(body), SECRET, 1_000_500).type, 'Issue');
});

test('a bad signature, missing signature or stale timestamp is rejected', () => {
    const body = Buffer.from(JSON.stringify({ type: 'Issue', webhookTimestamp: 1_000_000 }));
    assert.throws(() => verifyWebhook(body, sign(body).replace(/.$/, '0'), SECRET, 1_000_000));
    assert.throws(() => verifyWebhook(body, undefined, SECRET, 1_000_000));
    assert.throws(() => verifyWebhook(body, sign(body), SECRET, 1_000_000 + 61_000));
    const tampered = Buffer.from(JSON.stringify({ type: 'Issue', webhookTimestamp: 1_000_001 }));
    assert.throws(() => verifyWebhook(tampered, sign(body), SECRET, 1_000_000));
});

test('issue events name the project and flag state changes', () => {
    assert.deepEqual(
        readIssueEvent({ type: 'Issue', action: 'update', data: { id: 'i', projectId: 'p' }, updatedFrom: { stateId: 'old' } }),
        { issueId: 'i', projectIds: ['p'], stateChanged: true }
    );
    assert.deepEqual(
        readIssueEvent({ type: 'Issue', action: 'update', data: { id: 'i', projectId: 'p' }, updatedFrom: { title: 'x' } }),
        { issueId: 'i', projectIds: ['p'], stateChanged: false }
    );
    assert.deepEqual(
        readIssueEvent({ type: 'Issue', action: 'update', data: { id: 'i', projectId: 'new' }, updatedFrom: { projectId: 'old' } }).projectIds,
        ['new', 'old']
    );
    assert.equal(readIssueEvent({ type: 'Comment', data: {} }), null);
});
