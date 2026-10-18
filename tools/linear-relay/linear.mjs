//
// The few Linear GraphQL calls the relay makes, with a personal API key.
// Responses are flattened into the shape rules.mjs documents.

// LINEAR_API_URL exists for the smoke test's stand-in API, not for production.
const API = process.env.LINEAR_API_URL || 'https://api.linear.app/graphql';

export function createClient(apiKey) {
    async function request(query, variables) {
        const response = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: apiKey },
            body: JSON.stringify({ query, variables }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.errors) {
            const detail = body.errors?.map((error) => error.message).join('; ') || response.statusText;
            throw new Error(`Linear API ${response.status}: ${detail}`);
        }
        return body.data;
    }

    // 250 issues is far beyond a template project (20 issues plus generated
    // build, fix and check issues), so one page is enough.
    const PROJECT_QUERY = `
        query RelayProject($id: String!) {
            project(id: $id) {
                id
                name
                status { id name }
                issues(first: 250) {
                    nodes {
                        id
                        identifier
                        parent { id }
                        state { name type }
                        labels { nodes { name } }
                        delegate { id }
                        agentSessions(first: 20) { nodes { status createdAt appUser { id } } }
                        relations { nodes { type relatedIssue { id } } }
                        inverseRelations { nodes { type issue { id } } }
                    }
                }
            }
        }`;

    async function getProject(id) {
        const { project } = await request(PROJECT_QUERY, { id });
        if (!project) return null;
        return {
            id: project.id,
            name: project.name,
            status: project.status,
            issues: project.issues.nodes.map((node) => ({
                id: node.id,
                identifier: node.identifier,
                parentId: node.parent?.id ?? null,
                state: node.state,
                labels: node.labels.nodes.map((label) => label.name),
                delegateId: node.delegate?.id ?? null,
                // Newest first, sorted here rather than trusting the API's order.
                sessions: [...node.agentSessions.nodes]
                    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
                    .map((session) => ({ status: session.status, appUserId: session.appUser?.id ?? null })),
                blocks: node.relations.nodes
                    .filter((relation) => relation.type === 'blocks')
                    .map((relation) => relation.relatedIssue.id),
                blockedBy: node.inverseRelations.nodes
                    .filter((relation) => relation.type === 'blocks')
                    .map((relation) => relation.issue.id),
            })),
        };
    }

    async function getProjectStatuses() {
        const { projectStatuses } = await request(`query { projectStatuses { nodes { id name } } }`);
        return projectStatuses.nodes;
    }

    /** Projects currently in one of `statusNames`, for the periodic sweep. */
    async function getProjectIdsInStatuses(statusNames) {
        const wanted = new Set(statusNames.map((name) => name.trim().toLowerCase()));
        const { projects } = await request(`query { projects(first: 100) { nodes { id status { name } } } }`);
        return projects.nodes
            .filter((project) => wanted.has(project.status?.name.trim().toLowerCase()))
            .map((project) => project.id);
    }

    async function setProjectStatus(projectId, statusId) {
        await request(
            `mutation ($id: String!, $statusId: String!) {
                projectUpdate(id: $id, input: { statusId: $statusId }) { success }
            }`,
            { id: projectId, statusId }
        );
    }

    async function delegateIssue(issueId, delegateId) {
        await request(
            `mutation ($id: String!, $delegateId: String!) {
                issueUpdate(id: $id, input: { delegateId: $delegateId }) { success }
            }`,
            { id: issueId, delegateId }
        );
    }

    return { getProject, getProjectStatuses, getProjectIdsInStatuses, setProjectStatus, delegateIssue };
}
