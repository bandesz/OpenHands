# Public surface

The Agent Server gains a new skills-repository resource. The skills catalog gains one additive field. Callers are the local Agent Server session via `X-Session-API-Key`, the same trust boundary as settings. Cloud Canvas does not call these routes.

Compatibility: the resource is `new`. The catalog field is `additive`. `@openhands/typescript-client` is released with the generated operations before Canvas depends on them. In the same Canvas change that requires the resource, `compatibility.minimumAgentServer` in `config/defaults.json` becomes the first Agent Server version that ships it.

Git credentials stay in the server environment. Request bodies never contain a token.

## Resource

```json
{
  "url": "https://github.com/org/skills.git",
  "status": "ready",
  "commit_sha": "0123456789abcdef0123456789abcdef01234567",
  "checkout_path": "/Users/me/.openhands/skills-repository",
  "container_path": "/opt/openhands/skills-repository",
  "error_code": null,
  "error": null
}
```

`status` is `absent`, `syncing`, `ready`, or `error`.

| status | Meaning |
|---|---|
| `absent` | No URL is saved. `url`, `commit_sha`, `checkout_path`, and `container_path` are null. |
| `syncing` | A startup pull is in progress. The previous checkout, if any, is still what conversations load. |
| `ready` | The last clone or pull succeeded. |
| `error` | The last pull failed. The previous checkout is still what conversations load. |

`error_code` is `null`, `invalid_url`, `git_failed`, `dirty`, or `no_repository`. `container_path` is always `/opt/openhands/skills-repository` when a checkout exists, and null otherwise.

### `GET /api/skills/repository`

`200` with the resource, including when nothing is configured (`status: "absent"`).

### `PUT /api/skills/repository`

Body: `{ "url": "<git url>" }`. The URL must be `http`, `https`, or `ssh` (`ssh://` or `git@host:path`). The server resolves the remote default branch, clones it into `~/.openhands/skills-repository`, and responds when git finishes.

Valid: `PUT` `{ "url": "https://github.com/org/skills.git" }` returns `200` and a `ready` resource with the full `commit_sha` and `checkout_path`.

Invalid: `PUT` `{ "url": "not a url" }` returns `400`:

```json
{ "error_code": "invalid_url", "error": "Enter an http, https, or ssh git URL." }
```

Nothing is saved.

A failed clone returns `422` with `error_code` `git_failed` and git's reason in `error`. If another repository was already `ready`, that saved resource is unchanged. The first connection's failure leaves the saved resource `absent`.

### `POST /api/skills/repository/sync`

No body. Pulls the default branch with a fast-forward only.

- Dirty checkout: `409`. The resource has `status` `error`, `error_code` `dirty`, `error` `Repository has local changes. Pull was not applied.`, and the previous `commit_sha`. Files are unchanged.
- Network or git failure: `422`, `error_code` `git_failed`, git's reason in `error`. The previous checkout stays.
- No saved URL: `404`, `error_code` `no_repository`.

### `DELETE /api/skills/repository`

Removes the saved URL and the checkout. `204`, including when it was already absent. The confirmation dialog is only in the page.

## Catalog field

`GET /api/skills/catalog` entries may include:

```json
{
  "availability": "loaded",
  "shadow_reason": null
}
```

`availability` is `loaded` or `shadowed`. Omitted `availability` means loaded. `shadow_reason` is `null`, `handwritten`, or `duplicate_name`.

A shadowed skill uses the checkout path as `source`. Canvas disables its enable switch. `handwritten` means a skill of the same name already exists under `~/.agents/skills/` or `~/.openhands/skills/` outside the checkout. `duplicate_name` means another folder in the checkout has the same skill name and sorts first lexicographically by directory name.

Loaded repository skills use `origin` `user` and the checkout `SKILL.md` path as `source`.

## Docker mount

When `checkout_path` exists, a conversation started with `conversation_runtime: "docker"` bind-mounts that path at `/opt/openhands/skills-repository` read-only. No checkout means no mount. `/workspace` stays the selected project.

## Startup

On process start, a saved URL is fast-forwarded. The server still listens if the pull fails. Failure records `dirty` or `git_failed` and leaves the previous files in place. Skill on/off keeps using `disabled_skills`. Sync does not turn a skill back on.

## Canvas wrapper

HTTP above is the contract. Canvas loads `@openhands/typescript-client` from `file:../software-agent-sdk/clients/typescript` (fork commit `ee333b354`). `SkillsClient` on that package exposes one method per route. Canvas calls only that client, from `SkillsRepositoryService`:

| Wrapper | Route |
|---|---|
| `get()` | `GET /api/skills/repository` |
| `save(url)` | `PUT /api/skills/repository` |
| `sync()` | `POST /api/skills/repository/sync` |
| `remove()` | `DELETE /api/skills/repository` |

The wrapper is the only Canvas file that names `SkillsClient`'s repository methods.
