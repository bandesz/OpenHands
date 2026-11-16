# User flows

Canonical behavior for the skills repository. [public-api.md](public-api.md) and [batches.md](batches.md) match this file.

The panel lives on `/skills` for a local backend, above the catalog. A Cloud backend keeps today's Skills page and shows no repository panel. `/add-skill` is unchanged. The first Save syncs immediately. Replacing the URL swaps the checkout only after the new clone succeeds.

## Flow 1: Connect a repository

**Actor:** user on a local backend
**Precondition:** `/skills` is open and no skills repository is saved

**Steps:**

1. The page shows `skills-repository-panel` with an empty `skills-repository-url`. `skills-repository-save` is disabled. Sync is absent.
2. The user pastes `https://github.com/org/skills` and clicks Save. The panel shows "Syncing…" and the field and Save stay disabled.
3. Sync succeeds. The URL stays filled. `skills-repository-status` reads "Up to date" plus the 7-character SHA. `skills-repository-sync` is enabled. Each root `<name>/SKILL.md` appears as an enabled personal skill card whose source is the checkout path. The address stays `/skills`.

**Error paths:**

- A blank or non-URL value leaves Save disabled. The field shows "Enter an http, https, or ssh git URL."
- Clone fails (authentication, repository not found, or network). Status shows the `422` `error` string and keeps showing it until the user edits the URL or a later Save succeeds. No new skill cards appear. The typed URL stays in the field. No checkout is kept.
- The repo has no root `<name>/SKILL.md` folders. Status is "Up to date" and the panel adds "No skills found in this repository."

**Edge:** While the first GET is in flight, `skills-repository-loading` is shown and the empty form is not.

## Flow 2: A new conversation loads the skills

**Actor:** user
**Precondition:** Flow 1 succeeded. Skill `review` is enabled and its trigger is `review-please`.

**Steps:**

1. The user starts a Local or Worktree conversation and sends `review-please`.
2. The chat shows a Skill Ready row for `review`.
3. The workspace's `.agents/skills/` is unchanged.

## Flow 3: Docker can read the checkout and cannot write it

**Actor:** user
**Precondition:** Flow 1 succeeded and this server offers Docker.

**Steps:**

1. The user starts a Docker conversation.
2. The agent reads `/opt/openhands/skills-repository/review/SKILL.md` and receives the file contents.
3. Writing anywhere under `/opt/openhands/skills-repository/` fails because the mount is read-only.
4. `/workspace` is still only the selected project.

## Flow 4: Sync an update

**Actor:** user
**Precondition:** a repository is already up to date, and a conversation is open

**Steps:**

1. The user clicks Sync. Status becomes "Syncing…", then "Up to date" with the new 7-character SHA. Updated cards show the new descriptions.
2. The open conversation keeps the skill bodies it loaded at start.
3. A new conversation loads the updated `review` body.

**Error paths:**

- The checkout has uncommitted changes. Status becomes "Repository has local changes. Pull was not applied." The SHA and skill cards stay as they were.
- The pull fails on the network. Status shows the server's `error` string. The previous checkout, SHA, and cards stay.

## Flow 5: Pull when OpenHands starts

**Actor:** user
**Precondition:** a URL is already saved

**Steps:**

1. The user restarts OpenHands and opens `/skills`.
2. If the startup pull is still running, status reads "Syncing…" and the page refetches every 2 seconds until it finishes.
3. When the pull has finished, status shows the new 7-character SHA without clicking Sync.
4. If that pull failed, the Skills page still opens. Status shows the error. The previous skills remain available to new conversations.
5. If GET fails (network error or `404`), `skills-repository-status` shows the failure. The panel does not show the empty form as though no repository were saved.

## Flow 6: A hand-written skill wins

**Actor:** user
**Precondition:** `~/.agents/skills/review/SKILL.md` exists, and the repository also has `review/SKILL.md`

**Steps:**

1. `/skills` shows the hand-written `review` card, source path under `~/.agents/skills/review/`, enabled.
2. The repository copy is a second card with `skill-not-loaded-review` and the text "A hand-written skill with this name takes precedence." Its enable switch is disabled.
3. A new conversation's Skill Ready body is the hand-written text.
4. Sync does not change or delete `~/.agents/skills/review/`.

**Edge:** A second checkout folder with the same skill name shows `skill-not-loaded-review` and "Another skill in this repository uses this name." The lexicographically first directory is the loaded card.

## Flow 7: Turn a repository skill off

**Actor:** user
**Precondition:** repository skill `review` is enabled and not shadowed

**Steps:**

1. The user turns `review` off on its card. The card stays off after Sync and after a restart.
2. A new conversation does not show Skill Ready for its trigger.
3. Turning it back on loads it in the next new conversation.

## Flow 8: A skill disappears upstream

**Actor:** user
**Precondition:** `review` came only from the repository

**Steps:**

1. After the remote deletes `review/`, the user clicks Sync.
2. The `review` card is gone. Status is "Up to date" with the new SHA.
3. A new conversation does not load `review`.

## Flow 9: Remove the repository

**Actor:** user
**Precondition:** a repository is connected

**Steps:**

1. The user clicks `skills-repository-remove`. A dialog shows "Remove skills repository?" and "Repository skills will disappear from new conversations. Hand-written skills stay."
2. The user clicks `skills-repository-remove-confirm`. The panel returns to the empty URL field. Repository skill cards are gone, including "Not loaded" duplicates. Hand-written cards remain. Status is gone.
3. A new Docker conversation has no `/opt/openhands/skills-repository` mount. A new local conversation does not load the removed skills.

**Error path:**

- `skills-repository-remove-cancel`, Escape, or the backdrop leaves the URL, checkout, and cards unchanged.

## Flow 10: Replace the URL

**Actor:** user
**Precondition:** repository A is synced

**Steps:**

1. The user replaces the URL with repository B and clicks Save.
2. On success, A's cards are gone and B's cards are shown. Status shows B's SHA.
3. If B's clone fails, status shows the `422` `error` and keeps showing it until the user edits the URL or a later Save succeeds. A stays connected. A's cards remain.
