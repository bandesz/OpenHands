# Architecture

The Agent Server is the only writer of the checkout. Canvas reads the resource and sends save, sync, and remove.

## Checkout

The server persists the URL beside its other settings and stores the clone at `~/.openhands/skills-repository`. `commit_sha` is read from `git HEAD`. It is not stored a second time.

`PUT` clones into a temporary directory. It deletes the previous checkout and moves the new one into place only after git succeeds. A failed replacement leaves the previous checkout mounted and loaded.

`POST /sync` runs `git pull --ff-only` on the saved default branch. Uncommitted or untracked changes in the checkout return `409` `dirty` and do not run the pull. A second pull waits until the first finishes.

The default branch is the remote `HEAD` symbolic ref. The server does not guess `main`.

A skill is an immediate child directory of the checkout root that the existing personal-skill loader accepts as a skill. `.git` and other files are not skills.

## Precedence

Hand-written skills in `~/.agents/skills/` and in `~/.openhands/skills/` (excluding the checkout directory) win by skill name. The repository copy is returned in the catalog with `availability: "shadowed"` and `shadow_reason: "handwritten"`.

Two checkout folders with the same skill name: the lexicographically first directory path loads. The other is `shadow_reason: "duplicate_name"`.

`disabled_skills` still suppresses a loaded repository skill. It has no effect on a shadowed card. Removing a skill upstream does not edit `disabled_skills`.

## Docker

The Agent Server creates the conversation container. When the checkout directory exists, the server adds a read-only bind of `checkout_path` to `/opt/openhands/skills-repository`. Local and Worktree conversations read the host path and get no extra mount.

An open conversation keeps the skill bodies loaded at start. The mount is for files the agent reads or executes inside that container.

## Canvas

`SkillsRepositoryService` is the only caller. The Skills page:

- hides the panel when the active backend is Cloud
- renders Flow 1 through Flow 10 from the resource plus the catalog
- treats a loaded repository skill as a personal skill (`origin: "user"`, source under the checkout)
- leaves enablement on the existing `disabled_skills` writer

A `404` on `GET /api/skills/repository` after the compatibility floor includes this resource is a panel error (`skills-repository-status` shows the failure). Before that floor moves, this page does not ship.

## Errors

| Condition | Saved resource | Page |
|---|---|---|
| URL shape rejected | Unchanged | Field error, Save stays disabled once the client check fails. `400` is the server backstop. |
| First clone fails | Stays `absent` | Status shows the `422` `error` until the user edits the URL or a later Save succeeds. A refetch does not clear it. |
| Replacement clone fails | Previous `ready` resource | Status shows the `422` `error` under the same rule. Previous cards remain. |
| Dirty sync or startup pull | Previous SHA and files, `status: "error"`, `error_code: "dirty"` | Fixed dirty sentence. |
| Git or network failure | Previous files, `error_code: "git_failed"` | Server `error` string. |
| Remove | `absent`, directory deleted | Empty panel. Hand-written cards remain. |
