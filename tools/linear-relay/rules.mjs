//
// What the relay decides, kept free of I/O so it can be tested against plain
// objects. linear.mjs fetches a project into the shape below; server.mjs acts
// on the answers.
//
//   project = {
//     id, status: { id, name },
//     issues: [{
//       id, identifier, parentId,
//       state: { name, type },          // type: backlog|unstarted|started|completed|canceled|triage
//       labels: ['Agent' | 'Human', ...],
//       delegateId,                     // null when not delegated
//       blockedBy: [issueId, ...],      // issues that block this one
//       blocks: [issueId, ...],         // issues this one blocks
//     }],
//   }

const DONE_TYPES = new Set(['completed', 'canceled']);

export const isResolved = (issue) => DONE_TYPES.has(issue.state.type);

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Names the relay matches on. Defaults are the ones the process doc uses; they
 * are compared case-insensitively because Linear shows "Agent Working" for a
 * status created as "Agent working".
 */
export const DEFAULT_NAMES = {
    agentLabel: 'Agent',
    humanLabel: 'Human',
    needsHumanState: 'Needs Human',
    codeReviewState: 'In Code Review',
    speccing: 'Speccing',
    agentWorking: 'Agent working',
    awaitingHuman: 'Awaiting Human',
};

function openBlockers(issue, byId) {
    return issue.blockedBy.map((id) => byId.get(id)).filter((blocker) => blocker && !isResolved(blocker));
}

/**
 * The project status the issues say it should have, or null to leave it alone.
 *
 * Agent working  -- something is delegated to the agent and is not waiting on a
 *                   person (Needs Human, or a PR in code review).
 * Awaiting Human -- otherwise, when something is waiting on Theo: an issue in
 *                   Needs Human, or an open [Human] issue nothing blocks.
 *
 * Only projects already in one of the three managed statuses are touched, so
 * Idea, Shipped and Canceled are never overridden; Speccing is left until an
 * agent picks up work, since "Theo is writing the spec" is what it means.
 */
export function desiredProjectStatus(project, cyrusUserId, names = DEFAULT_NAMES) {
    const current = project.status?.name ?? '';
    const managed = [names.speccing, names.agentWorking, names.awaitingHuman];
    if (!managed.some((name) => sameName(name, current))) return null;

    const byId = new Map(project.issues.map((issue) => [issue.id, issue]));
    const open = project.issues.filter((issue) => !isResolved(issue));

    const waitingOnPerson = (issue) =>
        sameName(issue.state.name, names.needsHumanState) || sameName(issue.state.name, names.codeReviewState);

    const agentBusy = open.some((issue) => issue.delegateId === cyrusUserId && !waitingOnPerson(issue));
    if (agentBusy) return names.agentWorking;

    const humanNeeded = open.some(
        (issue) =>
            sameName(issue.state.name, names.needsHumanState) ||
            sameName(issue.state.name, names.codeReviewState) ||
            (issue.labels.some((label) => sameName(label, names.humanLabel)) &&
                openBlockers(issue, byId).length === 0)
    );
    if (humanNeeded) {
        return sameName(current, names.speccing) ? null : names.awaitingHuman;
    }
    return null;
}

/**
 * The issues to delegate to the agent now that `resolvedIssueId` is done.
 *
 * An issue qualifies when the resolved issue blocked it, it is an [Agent] issue
 * in the same project, it is a top-level issue (the orchestrator manages its own
 * sub-issues), it is not yet started or delegated, and nothing else still blocks
 * it. Called only on a state change into completed/canceled, never on a sweep,
 * so an issue Theo deliberately undelegates is not picked up again later.
 */
export function issuesToDelegate(project, resolvedIssueId, names = DEFAULT_NAMES) {
    const byId = new Map(project.issues.map((issue) => [issue.id, issue]));
    const resolved = byId.get(resolvedIssueId);
    if (!resolved || !isResolved(resolved)) return [];

    return resolved.blocks
        .map((id) => byId.get(id))
        .filter(Boolean)
        .filter((issue) => issue.labels.some((label) => sameName(label, names.agentLabel)))
        .filter((issue) => !issue.parentId)
        .filter((issue) => !issue.delegateId)
        .filter((issue) => ['backlog', 'unstarted', 'triage'].includes(issue.state.type))
        .filter((issue) => openBlockers(issue, byId).length === 0);
}
