# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Plouf Bag is a paragliding flight tracking application that integrates with Strava to analyze and display flight statistics. The project uses a microservices architecture with a Next.js frontend, Express.js backend services, and PostgreSQL database, all deployed on Google Cloud Platform.

## Architecture

### Core Components
- **`/common`** - Shared TypeScript package with database models, utilities, and core business logic
- **`/functions`** - Backend services (API, tasks, webhooks) deployed as Cloud Run containers
- **`/site`** - Next.js frontend application
- **`/infra`** - Terraform infrastructure definitions
- **`/dev`** - Scripts for running Postgres and the site locally without Docker

### Key Technologies
- **Database**: PostgreSQL with PostGIS extension for geospatial queries
- **Authentication**: JWT with Strava OAuth 2.0 integration  
- **Background Jobs**: Google Cloud Tasks for reliable async processing
- **Testing**: Vitest with Testcontainers for integration tests
- **Deployment**: Docker containers with Terraform infrastructure

## Common Development Commands

### Build and Deploy (from root)
```bash
# Full deployment pipeline
task deploy

# Local development with hot reload
task local-build
docker compose up

# Individual service builds
task functions:build
task site:deploy
task infra:apply
```

### Functions Development
```bash
cd functions

# Development servers with hot reload
yarn devApi        # API server on port 3001
yarn devTasks      # Tasks server on port 3002  
yarn devWebhooks   # Webhooks server on port 3003

# Production build (includes common package copy)
yarn buildProd

# Run tests (uses Testcontainers for PostgreSQL)
yarn test
```

### Site Development
```bash
cd site

yarn dev          # Next.js dev server on port 3000
yarn build        # Production build
yarn start        # Start production server
```

### Common Package Development
```bash
cd common

yarn build        # Compile TypeScript
yarn dev          # Watch mode compilation
yarn test         # Run unit tests
```

## Database Schema

### Core Tables
- **`pilots`** - User accounts with Strava tokens and profile data
- **`flights`** - Paragliding flights derived from Strava activities with geospatial data
- **`sites`** - Takeoff/landing sites with PostGIS polygon data from FFVL API
- **`windsocks`** - Wind measurement stations
- **`description_preferences`** - User preferences for AI-generated flight descriptions

### Migration Scripts
Database schema changes are SQL files in `functions/src/model/database/scripts/`, listed in the order they must be applied in `manifest.txt` alongside them.

The deploy applies the manifest — `scripts/migrate.sh`, run before Terraform in both `task deploy` and the GitHub Actions workflow — and records what ran in `schema_migrations`. Nothing is applied by hand.

Adding a script means adding it to `manifest.txt`; a test fails if a `.sql` file is in neither the manifest nor the documented exclusions. Every script there is re-applied on every deploy, so it must be guarded (`create table if not exists`, `add column if not exists`) and must not drop or truncate — `migrate.sh` refuses anything that does.

`scripts/migrate.sh --check` reports what a database is missing without changing it (`task db:check`).

## Re-syncing a pilot from Strava

`.github/workflows/sync.yml`, dispatched by hand from the Actions tab. Inputs: a
Strava athlete id (or a comma-separated list; blank means every pilot), and a
dry-run flag that scans and reports without creating flights or writing anything
to Strava.

The workflow dispatches and nothing else: it POSTs a `FetchAllActivities` task
to the deployed tasks service — the same body Cloud Tasks sends — and prints the
summary that comes back, re-dispatching until `remaining` reaches zero, because
promotion is batched and a backlog takes several runs. It holds no database
credentials and runs no import logic of its own; a runner executing source from
a branch is not the same thing as the bundle that is deployed.

Before this, the only way to re-read a pilot's history was to answer the activity
type question on `/welcome` again, which triggered `FetchAllActivities` as a side
effect. That is not a remedy anyone would find, and when `/welcome` itself was
broken it silently did nothing at all.

## Task System

Background jobs are processed via Google Cloud Tasks:

- **`fetchAllActivities`** - Sync Strava activities to flights table
- **`syncSites`** - Update paragliding sites from external FFVL API  
- **`updateDescription`** - Generate AI-powered flight descriptions using preferences
- **`helloWorld`** - Health check task

Task handlers and their business logic are both in `functions/src/tasks/`.

## Testing

Use `yarn test` in any package. Functions package uses Testcontainers to spin up PostgreSQL for integration tests with 60-second timeout.

Test database operations thoroughly as they involve complex geospatial queries for site proximity calculations.

## Common Patterns

- **Shared Models**: All database types and API models are in `/common` package
- **Task Dependencies**: Functions create task dependencies via `createTaskDependencies()` adapter
- **Geospatial Queries**: Use PostGIS `earthdistance` for site proximity calculations  
- **Error Handling**: Tasks return `{ success: boolean, message?: string }` pattern
- **Authentication**: JWT tokens in cookies, Strava OAuth refresh token handling

## Development Workflow Guardrails

**MANDATORY: Claude Code must follow these guardrails for ALL code changes:**

### 1. Initial Setup (IMMEDIATE)
**BEFORE making ANY code changes, Claude Code must:**
1. **IMMEDIATELY** create a new feature branch from main
   - Branch naming: `feature/description`, `fix/description`, `refactor/description`
   - Use descriptive names based on the work being requested
2. **IMMEDIATELY** create a draft PR to track progress
   - Set as draft until work is complete
   - Include initial description of planned work
   - **MANDATORY**: PR author must be @claude

### 2. Branch Management
- **NEVER** commit directly to `main` branch
- All work must be done on feature branches
- Delete feature branches after PR merge

**After a PR merges, start the next piece of work from a fresh base.** PRs here
are squash-merged, so the branch's own commits never become ancestors of `main`:
carrying on committing to the same local branch puts the merged changes on both
sides under different identities, and every one of them comes back as a conflict.
It has happened twice.

Re-branch, and check before pushing rather than finding out on the PR:

```bash
git fetch origin main
git checkout -B <branch> origin/main     # after a merge, always
...
git merge-base --is-ancestor origin/main HEAD \
  || git rebase --onto origin/main <last-merged-commit>
```

That check is the whole guardrail: if `origin/main` is not an ancestor of `HEAD`,
the PR will conflict, and rebasing the unmerged commits onto `origin/main` is the
fix. Run it before every push.

### 3. Pre-Commit Requirements
Before EVERY commit, Claude Code must:
1. Run full test suite for affected packages:
   - `cd common && yarn test && yarn build`
   - `cd functions && yarn test`
   - `cd site && yarn build`
2. Test locally with `task local-build && docker compose up`
3. Verify all services start correctly and endpoints respond
4. Only commit if all tests pass and local deployment succeeds

### 4. Commit Strategy
- Make small, focused commits with clear messages
- Many small commits per branch are encouraged
- Each commit must pass all pre-commit requirements
- Commit message format: `type: brief description`

### 5. Pull Request Workflow
- Draft PR is created immediately at start (see Initial Setup)
- Convert from draft to ready when feature is complete and fully tested
- PR will be squashed into single commit on main
- Include clear description of changes and test plan
- **MANDATORY**: Include complete conversation history in PR description:
  - Copy full conversation thread that led to the changes
  - Include all user prompts and Claude responses
  - Use collapsible sections for long conversations: `<details><summary>Conversation History</summary>...conversation...</details>`
  - This ensures full context and traceability of all changes
- **NEVER** merge without human review

### 6. Rollback Strategy
- Keep git history clean for easy rollbacks
- Document any infrastructure changes in PR description
- If deployment fails, immediately revert to last known good state

### 7. Testing Requirements
- Full test suite before every commit
- Local integration testing with Docker Compose
- For infrastructure: `terraform plan` before any applies
- Validate API endpoints and frontend functionality

**Claude Code will refuse to proceed if any guardrail is violated.**

## Claude Commands

Common development tasks are available as slash commands in `.claude/commands.md`:
- `/start-work` - Create feature branch and draft PR
- `/deploy` - Run full deployment pipeline  
- `/test-changes` - Run comprehensive test suite
- `/check-health` - Verify local build and service health
- `/publish-pr` - Convert draft PR to ready with conversation history

## Legacy Development Workflow

1. Make changes in relevant package (`common`, `functions`, `site`)
2. Run tests with `yarn test` 
3. For local testing, use `task local-build && docker compose up`
4. Deploy individual services or full stack with `task deploy`

The monorepo structure requires building the common package before consuming packages can use changes.