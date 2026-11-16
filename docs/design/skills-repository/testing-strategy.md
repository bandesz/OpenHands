# Testing strategy

[user-flows.md](user-flows.md) is the behavior. This file maps each flow to the suite that proves it.

`frontend-development` applies to the Skills page. `frontend-api-contracts` applies to `SkillsRepositoryService`, the typed client, the compatibility floor, and skipping the resource on Cloud.

## Where each flow is proved

| Flow | Proved by |
|---|---|
| 1 Connect, empty repo, failed first clone | Canvas page test. Agent Server test for the clone and the `422` body. |
| 2 Skill Ready in a new local conversation, workspace unchanged | Agent Server skill-load test. Canvas already renders Skill Ready for a loaded personal skill. |
| 3 Docker read and failed write, `/workspace` unchanged | Agent Server conversation-runtime test. No Canvas page covers the mount. |
| 4 Sync success, dirty, network failure, open conversation unchanged | Canvas page test for the status line and cards. Agent Server test for the checkout and for not injecting the new body into an existing conversation. |
| 5 Startup pull result on the page, including a failed GET | Canvas page test renders `ready`, `error`, and `syncing` from GET, refetches while `syncing`, and shows a failed GET in the status line instead of the empty form. Agent Server test runs the pull at process start and still serves after failure. |
| 6 Hand-written skill wins | Canvas page test for the two cards and the disabled switch. Agent Server test for the loaded body and for leaving `~/.agents/skills/review/` untouched. |
| 7 Turn a repository skill off | Canvas page test uses the existing `disabled_skills` writer and shows the card still off after a sync refetch. Agent Server test omits a disabled repository skill from a new conversation. |
| 8 Skill removed upstream | Canvas page test: after sync, the catalog fixture omits `review` and the card is gone. Agent Server test deletes the folder from the checkout on a successful pull. |
| 9 Remove, and dismiss | Canvas page test. Agent Server test for `204` and a deleted checkout. |
| 10 Replace the URL, and a failed replacement | Canvas page test. Agent Server test that a failed clone keeps the previous checkout. |

## Canvas rules

- Page tests mock `SkillsRepositoryService` and the existing catalog and settings services. They do not mock the Skills page hook.
- Extend `__tests__/routes/skills-settings.test.tsx` for the panel. Put the service tests in `__tests__/api/skills-repository-service.test.ts`.
- New copy goes in `src/i18n/translation.json`. The task runs `npm run make-i18n` before Vitest.
- Do not raise `compatibility.minimumAgentServer` until the task whose acceptance names the released Agent Server version.

## Agent Server rules

Batches 1 and 2 land in `software-agent-sdk`, not this repository. Each task there adds the test named in [batches.md](batches.md) and runs that file only.

## Coverage after Batches 1 and 2

- [x] Agent Server clone, invalid URL, failed replacement, sync, delete, precedence, Docker mount flag, and startup pull — `tests/agent_server/test_skills_repository.py`
- [x] Typed client GET, PUT, POST `/sync`, DELETE, and catalog `availability` — `clients/typescript/src/skills-repository.test.ts`
- [x] Canvas page tests for Flows 1 and 4–10 — `__tests__/routes/skills-settings.test.tsx`. The client is the local `file:` checkout, not an npm release. Flows 2 and 3 stay on the Agent Server.
- [x] `compatibility.minimumAgentServer` is `1.62.0` — Batch 3 task 3.8. A stock 1.62.0 server without the route shows the failed-GET state.
