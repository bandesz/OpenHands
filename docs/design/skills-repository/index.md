# Skills repository

## Implementation status
**Status:** complete
**Review fixes:** `d89e7fb0a`

Load every skill from one git repository into OpenHands as personal skills. The Agent Server keeps a host checkout, pulls the remote default branch, and bind-mounts that checkout read-only into Docker conversations. The Skills page on a local backend sets the URL, shows sync status, and can sync or remove the repository.

Canvas does not clone, pull, or start the container. Those belong to the Agent Server in [`software-agent-sdk`](https://github.com/OpenHands/software-agent-sdk). This repository owns the Skills page and the typed-client call.

## Problem

`/add-skill` installs one GitHub skill into the current workspace's `.agents/skills/`. A repository of many skills never becomes available across conversations, and a Docker conversation cannot see personal skill files unless they are mounted.

## Decisions

| Decision | Choice |
|---|---|
| Where skills are available | Personal library for every new conversation. The workspace is unchanged. |
| How they stay current | Pull on Agent Server startup, and when the user clicks Sync. |
| How Docker sees them | One host checkout, bind-mounted read-only. |
| Repository layout | `<name>/SKILL.md` at the repository root. The checkout root is the skill parent. |
| Name clash with a hand-written skill | The hand-written skill loads. The repository copy is shown as not loaded. |
| Agent writes | Read-only mount. A dirty checkout blocks pull and keeps the current files. |
| Which revision | One URL. The remote's default branch. |
| Owner | Agent Server owns checkout, pull, load, and mount. Canvas owns the page. |

Alternatives considered: copying into `~/.agents/skills/` (overwrites hand-written skills and skips a dedicated mount); a path the user maintains outside OpenHands (no automatic pull); modeling the repository as a plugin (wrong package shape and trust flow).

## Assumptions

- The panel is on `/skills`, above the catalog, for a local backend only.
- The checkout directory is `~/.openhands/skills-repository`.
- Docker mounts it at `/opt/openhands/skills-repository`.
- The page shows the first 7 characters of `commit_sha` after "Up to date".
- Save and Sync wait for the HTTP response. The server kills the git command after 120 seconds.
- While `status` is `syncing`, the page refetches every 2 seconds.
- While the first GET is in flight, the panel shows a skeleton and does not flash the empty form.
- Skill names come from the existing personal-skill loader.
- Two repository skills with the same name: the lexicographically first directory loads.
- A new repository skill starts enabled. Sync does not clear `disabled_skills`.
- A `disabled_skills` entry whose skill folder is gone stays in the list.
- Remove confirmation copy is "Remove skills repository?" / "Repository skills will disappear from new conversations. Hand-written skills stay." with buttons Remove and Cancel.
- The second of two overlapping pulls waits for the first. There is no extra error code.
- Clone is a full clone, then fast-forward pull of the default branch.
- Git credentials are the server process environment only (`GITHUB_TOKEN`, SSH keys, or the git credential helper).
- A failed Save shows that response's `error` until the user edits the URL or a later Save, Sync, or Remove succeeds. A refetch of the saved resource does not clear it. The saved resource itself stays `absent` (first connect) or the previous `ready` repository (replacement).
- `@openhands/typescript-client` is the local package `file:../software-agent-sdk/clients/typescript` from `bandesz/software-agent-sdk` commit `ee333b354` (`1.62.0-patched`). It is not an npm release. `SkillsClient` on that package has `get`, `save`, `sync`, and `remove`.
- `compatibility.minimumAgentServer` becomes `1.62.0`, the version the patched Agent Server reports. A stock 1.62.0 server without this route shows the failed-GET state.

## Non-goals

- More than one repository.
- A branch, tag, or commit pin.
- Cloud.
- A writable mount, or reloading skills into an open conversation.
- Changing `/add-skill`, or copying skills into a workspace.
- A scheduled pull other than process start and Sync.

## Documents

| Document | What it decides |
|---|---|
| [user-flows.md](user-flows.md) | What the user sees. This file is canonical for behavior. |
| [public-api.md](public-api.md) | Agent Server routes, catalog field, auth, and examples. |
| [architecture.md](architecture.md) | Checkout, precedence, mount, and how the page calls the server. |
| [testing-strategy.md](testing-strategy.md) | Which suite proves each flow. |
| [batches.md](batches.md) | Implementation order and task acceptance. |

Start with [user-flows.md](user-flows.md). Implementers in this repository start at Batch 3 in [batches.md](batches.md) after Batches 1 and 2 have shipped.
