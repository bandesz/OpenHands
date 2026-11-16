# Batches

[user-flows.md](user-flows.md) is canonical. Do not start a batch until the batch before it has shipped.

Batch 1 and Batch 2 are implemented in [`software-agent-sdk`](https://github.com/OpenHands/software-agent-sdk). Batch 3 is this repository. Test files named below are created by that task if they do not exist yet.

## Batch 1: Agent Server resource

**Status:** done

**Scope:** Checkout, the four routes, catalog `availability`, startup pull, and the read-only Docker mount. Excludes the TypeScript client release and the Skills page.

### Task 1.1: Save a repository and read it back

**Status:** done — `f154762b7` (+ review fixes: `0f438609d`)

- Files: create `tests/agent_server/test_skills_repository.py` in software-agent-sdk; add the skills-repository resource beside the existing skills API
- TDD: yes
- UI flow: Flow 1
- Verify: `pytest tests/agent_server/test_skills_repository.py -q`
- Acceptance: `GET /api/skills/repository` on a fresh server returns `200` with `status` `absent` and null `url`, `commit_sha`, and `checkout_path`. `PUT` with `https://github.com/org/skills.git` whose root contains `review/SKILL.md` returns `200` `ready`, a 40-character `commit_sha`, and `checkout_path` ending in `.openhands/skills-repository`. A second GET returns that resource.
- Out of scope: invalid URLs, sync, Docker
- Domain skills: none in this repository

### Task 1.2: Reject a bad URL and keep the previous checkout

**Status:** done — `8aea156ea`

- Files: modify `tests/agent_server/test_skills_repository.py` and the skills-repository resource
- TDD: yes
- UI flow: Flow 1, Flow 10
- Verify: `pytest tests/agent_server/test_skills_repository.py -q`
- Acceptance: `PUT` `{ "url": "not a url" }` returns `400` `invalid_url` and the saved resource stays `absent`. After a `ready` checkout of repository A, a `PUT` whose clone fails returns `422` `git_failed`, and GET still returns A's `commit_sha` and checkout. A's files are still on disk.
- Out of scope: sync and delete
- Domain skills: none in this repository

### Task 1.3: Sync

**Status:** done — `86621adb3`

- Files: modify `tests/agent_server/test_skills_repository.py` and the skills-repository resource
- TDD: yes
- UI flow: Flow 4, Flow 8
- Verify: `pytest tests/agent_server/test_skills_repository.py -q`
- Acceptance: `POST /api/skills/repository/sync` with no saved URL returns `404` `no_repository`. A fast-forward returns `200` `ready` with the new SHA, and a skill folder removed on the remote is gone from the checkout. A dirty checkout returns `409` `dirty` with the fixed error sentence and the previous SHA. A failing pull returns `422` `git_failed` and leaves the previous files in place. The git command is killed at 120 seconds.
- Out of scope: startup hook, Docker
- Domain skills: none in this repository

### Task 1.4: Remove

**Status:** done — `9babb14f5`

- Files: modify `tests/agent_server/test_skills_repository.py` and the skills-repository resource
- TDD: yes
- UI flow: Flow 9
- Verify: `pytest tests/agent_server/test_skills_repository.py -q`
- Acceptance: `DELETE /api/skills/repository` returns `204`, the checkout directory is gone, and GET returns `absent`. A second DELETE also returns `204`.
- Out of scope: the confirmation dialog
- Domain skills: none in this repository

### Task 1.5: Precedence and catalog availability

**Status:** done — `5745f0431`

- Files: modify `tests/agent_server/test_skills_repository.py` and the skills catalog serializer
- TDD: yes
- UI flow: Flow 2, Flow 6, Flow 7
- Verify: `pytest tests/agent_server/test_skills_repository.py -q`
- Acceptance: A loaded repository skill appears in `GET /api/skills/catalog` with `origin` `user`, `availability` `loaded`, and `source` under the checkout. The same name in `~/.agents/skills/` loads that hand-written body into a new conversation, leaves that folder unchanged, and returns the checkout copy with `availability` `shadowed` and `shadow_reason` `handwritten`. Two checkout folders with the same skill name load the lexicographically first directory and shadow the other with `duplicate_name`. A name in `disabled_skills` is not loaded into a new conversation. Sync does not remove that `disabled_skills` entry. The workspace `.agents/skills/` is unchanged.
- Out of scope: the Skills page switch
- Domain skills: none in this repository

### Task 1.6: Read-only Docker mount

**Status:** done — `a2e582d87`

- Files: modify `tests/agent_server/test_skills_repository.py` and the Docker conversation runtime
- TDD: yes
- UI flow: Flow 3
- Verify: `pytest tests/agent_server/test_skills_repository.py -q`
- Acceptance: A Docker conversation whose checkout exists mounts `checkout_path` read-only at `/opt/openhands/skills-repository`. Reading `review/SKILL.md` there returns the file. Creating a file there fails. `/workspace` is only the selected project. After DELETE, a new Docker conversation has no that mount.
- Out of scope: Canvas
- Domain skills: none in this repository

### Task 1.7: Pull on process start

**Status:** done — `72165f19b`

- Files: modify `tests/agent_server/test_skills_repository.py` and the Agent Server startup path
- TDD: yes
- UI flow: Flow 5
- Verify: `pytest tests/agent_server/test_skills_repository.py -q`
- Acceptance: Process start with a saved URL starts a fast-forward and still accepts requests while it runs. While `status` is `syncing`, GET returns the previous `commit_sha` and a new conversation still loads the previous skills. After the pull succeeds, a later catalog request includes the updated skills. A failed startup pull still lets the server accept requests. GET then returns `status` `error` with the previous `commit_sha`, and a new conversation still loads the previous skills. A dirty checkout at start records `dirty` and does not discard the files.
- Out of scope: the page's 2-second refetch
- Domain skills: none in this repository

## Batch 2: Typed client

**Status:** done

**Scope:** Add the client operations for the four routes. Excludes the Skills page, the compatibility floor, and npm publication (that stays on the monorepo release).

### Task 2.1: Publish the client operations

**Status:** done — `990d5ae08`

- Files: handwritten skills client in `clients/typescript`; add `clients/typescript/src/skills-repository.test.ts`. Do not regenerate `src/generated/agent-server-schema.ts` from this unreleased server.
- TDD: yes
- UI flow: N/A
- Verify: `npm test -- skills-repository.test.ts` (run from `clients/typescript`; this package is not an npm workspace)
- Acceptance: `SkillsClient` can GET, PUT, POST `/api/skills/repository/sync`, and DELETE the resource, and the test decodes `status`, `commit_sha`, `error_code`, and `availability`. npm publication is the existing release workflow and is not part of this commit. The OpenHands repository `package.json` is unchanged.
- Out of scope: Canvas service and UI
- Domain skills: `frontend-api-contracts` when the version is later pinned here

## Batch 3: Skills page

**Status:** done

**Scope:** The `/skills` panel, shadowed cards, and the compatibility floor. Excludes Agent Server changes. The typed client is `file:../software-agent-sdk/clients/typescript` at commit `ee333b354`, not an npm release.

### Task 3.1: Repository service

**Status:** done — `538ea1f7c`

- Files: create `src/api/skills-repository-service.ts` and `__tests__/api/skills-repository-service.test.ts`; add `SKILLS_REPOSITORY_QUERY_KEYS` in `src/hooks/query/query-keys.ts`; point `@openhands/typescript-client` in `package.json` and `package-lock.json` at `file:../software-agent-sdk/clients/typescript`
- TDD: yes
- UI flow: N/A
- Verify: `npx vitest run __tests__/api/skills-repository-service.test.ts`
- Domain skills: `frontend-api-contracts`
- Acceptance: `package.json` depends on `file:../software-agent-sdk/clients/typescript`. `get`, `save`, `sync`, and `remove` call `SkillsClient` from that package and return the resource. A Cloud backend does not call the client and `get` resolves `status` `absent`. A `422` and a `409` expose `error_code` and `error` from the response body.
- Out of scope: the Skills page, `config/defaults.json`

### Task 3.2: Connect a repository

**Status:** done — `391aa8187`

- Files: create `src/hooks/query/use-skills-repository.ts` and `src/components/features/skills/skills-repository-panel.tsx`; modify `src/routes/skills-settings.tsx`, `src/i18n/translation.json`, and `__tests__/routes/skills-settings.test.tsx`
- TDD: no (UI flow test)
- UI flow: Flow 1
- Verify: `npm run make-i18n && npx vitest run __tests__/routes/skills-settings.test.tsx`
- Domain skills: `frontend-development`, `frontend-api-contracts`
- Acceptance: On a local backend the panel sits above the catalog. The first paint shows `skills-repository-loading` and not the empty form. An absent resource shows an empty URL field, disabled Save, and no Sync. Save of `https://github.com/org/skills` shows "Syncing…" and then "Up to date" with the 7-character SHA, an enabled Sync button, and an enabled `review` card whose source is the checkout path. A ready resource with no skill folders also shows "No skills found in this repository." The address stays `/skills`.
- Out of scope: failed clone, replace, Cloud, the compatibility floor

### Task 3.3: Failed save and failed replacement

**Status:** done — `182e5b25c` (+ review fixes: `5f3d17409`, `22e7755dc`)

- Files: modify `src/components/features/skills/skills-repository-panel.tsx`, `src/i18n/translation.json`, and `__tests__/routes/skills-settings.test.tsx`
- TDD: no (UI flow test)
- UI flow: Flow 1, Flow 10
- Verify: `npm run make-i18n && npx vitest run __tests__/routes/skills-settings.test.tsx`
- Domain skills: `frontend-development`
- Acceptance: A blank or non-URL value leaves Save disabled and the field shows "Enter an http, https, or ssh git URL." A failed first `save` shows the server `error`, keeps the typed URL, and adds no skill card; the message stays until the URL is edited. When A is ready and `save` of B fails, the error stays, A's SHA stays, and A's cards stay.
- Out of scope: sync and remove

### Task 3.4: Sync status and startup status

**Status:** done — `3921486bf`

- Files: modify `src/components/features/skills/skills-repository-panel.tsx`, `src/hooks/query/use-skills-repository.ts`, and `__tests__/routes/skills-settings.test.tsx`
- TDD: no (UI flow test)
- UI flow: Flow 4, Flow 5, Flow 8
- Verify: `npx vitest run __tests__/routes/skills-settings.test.tsx`
- Domain skills: `frontend-development`
- Acceptance: Sync shows "Syncing…" then "Up to date" with the new 7-character SHA, and the catalog refetch replaces the `review` description. A `409` `dirty` shows "Repository has local changes. Pull was not applied." and the previous SHA. A `422` `git_failed` shows the server `error` and the previous SHA. A GET `syncing` shows "Syncing…" and issues another GET within 2 seconds. A GET `error` shows the server `error`. A failed GET shows the failure in `skills-repository-status` and does not show the empty URL form. After a sync whose catalog omits `review`, the `review` card is gone.
- Out of scope: a real process restart, Docker

### Task 3.5: Shadowed repository skill

**Status:** done — `278669aaf` (+ review fixes: `2347c596f`)

- Files: modify `src/components/features/skills/skill-card.tsx`, `src/i18n/translation.json`, and `__tests__/routes/skills-settings.test.tsx`
- TDD: no (UI flow test)
- UI flow: Flow 6
- Verify: `npm run make-i18n && npx vitest run __tests__/routes/skills-settings.test.tsx`
- Domain skills: `frontend-development`
- Acceptance: A catalog entry with `availability` `shadowed` and `shadow_reason` `handwritten` renders a second `review` card, `skill-not-loaded-review`, and "A hand-written skill with this name takes precedence." Its enable switch is disabled. The hand-written card stays enabled and keeps its `~/.agents/skills/review/` source. `duplicate_name` uses "Another skill in this repository uses this name."
- Out of scope: changing `disabled_skills`

### Task 3.6: Turn a repository skill off

**Status:** done — `8f46c921a`

- Files: modify `__tests__/routes/skills-settings.test.tsx` and `src/components/features/skills/skill-card.tsx`
- TDD: no (UI flow test)
- UI flow: Flow 7
- Verify: `npx vitest run __tests__/routes/skills-settings.test.tsx`
- Domain skills: `frontend-development`
- Acceptance: Turning off a loaded repository skill writes it to `disabled_skills`. A later sync refetch still shows that card off. Turning it on removes it from `disabled_skills`.
- Out of scope: Agent Server conversation loading

### Task 3.7: Remove the repository

**Status:** done — `66a6123e8` (+ review fixes: `0c5378e84`)

- Files: modify `src/components/features/skills/skills-repository-panel.tsx`, `src/i18n/translation.json`, and `__tests__/routes/skills-settings.test.tsx`
- TDD: no (UI flow test)
- UI flow: Flow 9
- Verify: `npm run make-i18n && npx vitest run __tests__/routes/skills-settings.test.tsx`
- Domain skills: `frontend-development`
- Acceptance: Remove opens a dialog with "Remove skills repository?" and "Repository skills will disappear from new conversations. Hand-written skills stay." Confirm calls `remove`, clears the URL field, removes repository cards including the not-loaded card, and leaves the hand-written card. Cancel, Escape, and the backdrop leave the URL and cards in place.
- Out of scope: the Agent Server deleting the directory

### Task 3.8: Cloud and the compatibility floor

**Status:** done — `3888db914`

- Files: modify `src/routes/skills-settings.tsx`, `__tests__/routes/skills-settings.test.tsx`, and `config/defaults.json`
- TDD: no (UI flow test)
- UI flow: Flow 1
- Verify: `npx vitest run __tests__/routes/skills-settings.test.tsx`
- Domain skills: `frontend-development`, `frontend-api-contracts`
- Acceptance: A Cloud backend renders no `skills-repository-panel` and does not call `SkillsRepositoryService`. `compatibility.minimumAgentServer` is `1.62.0`, the version the patched Agent Server reports.
- Out of scope: publishing a new Agent Server version. A stock 1.62.0 server without the route shows the failed-GET state.
