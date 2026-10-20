# codex-extras

User-owned profile bundle for DeepSeek Harness: codex-style capabilities that
live **outside** the harness repository, so upstream updates never conflict
with them. Provides the human `/review` and `/fill` commands and declares the
companion `codex-style` agent preset, including its model-aware persona
provider and review skill. The `tools` `search` disclosure mode was
deliberately shelved: it changes the `dsh-tools` registry internals and has no
plugin seam, so it is not part of this package.

This checkout targets dsh **0.2.x**, where an agent preset is a
`@deepseek-ai/dsh-agent-preset` declaration inside a bundle patch rather than
a `$DSH_HOME/.agent-presets/<id>/` directory. The earlier directory-preset
layout is no longer read by the harness, and the subagent start API changed
from `subagents.start()` to `subagents.startActivation()`; both are migrated
here.

## What it provides

### `/review` command (profile bundle)

A human slash command that runs an independent one-shot child agent
(`ctx.subagents`, provider `spawn` by default) over the working diff and
returns its findings. The child runs in its own context, so its verdict never
enters the parent's model history. This is a plain-ESM Cordis function plugin
(`review.js`) with no runtime imports: it only consumes the `commands` and
`subagents` services the base bundle provides. The row lives in
`cordis.patch.yml` (profile root), the same place the base bundle registers
`/goal` and `/compact`.

### `/fill` command (profile bundle)

A human slash command (`fill.js`) that fills the placeholders of a project
template file. It is meant for workflows that start from a cloned template, and
it asks before it writes: a template's placeholders are product decisions, and a
freshly cloned repository supports none of them, so a repository-only fill would
report almost every token as unfilled.

Run `/fill` after cloning. The command asks three questions — purpose, type and
stack, and any project-specific constraints — through the `userQuestions` seam,
then spawns an independent child agent that fills `AGENTS.md` (or the file you
name, `/fill <file>`) from those answers plus the facts the repository does carry
(git remote, package name/description, language, license, dates). The child
derives what the answers imply (project name and root directory from the
directory name, a starting version, the per-layer stack prose, the project type)
and reconciles the template's generic "project structure" block with the answered
stack, so it never describes directories the project will not have. It reports
`token -> value` plus a "Remaining" list, and never invents a value.

The questions are asked by the command rather than the child, because a child
agent owned by another agent cannot call `ask_user_question`. When that seam is
unavailable or the ask fails, `/fill` does not block: it states the gap and falls
back to a repository-only fill. Invoking `/fill` is the explicit request that
authorizes the edits; the child still follows the sandbox and approval rules.

### `codex-style` agent preset (bundle declaration)

`presets/codex-style.patch.yml` inserts a `@deepseek-ai/dsh-agent-preset` row
with id `codex-style` and layers a Codex-shaped persona, the single
`str_replace_editor`, and the `codex-review` skill on top of the full
`standard` tool surface. It is installed by the same `dsh plugin add` command
as the commands — no roster registration, no separate copy step, and no
repository changes.

Two capabilities are carried by this package rather than a preset directory:

- `persona.js` (package subpath `codex-extras/persona`) — the persona provider.
  It is a standalone equivalent of the `dsh-persona` row plus per-model
  `variants`: a map from a resolved model id (or `*`) to persona text; exact id
  wins, then `*`, then `prefix`. A 0.2.x preset declaration resolves its child
  rows against the declaring Loader's base (the profile directory), so a
  preset-local `./plugins/…` file no longer resolves; the provider must be an
  installed package, and this bundle is that package. Configure `variants` in
  `presets/codex-style.patch.yml` under the `persona` row. The shipped persona
  carries an **engineering contract** in every tier: ask before you write (edit
  only when the user explicitly asked, otherwise research and offer options
  first), never assume intent, and architecture first — orchestrate the whole
  task (统筹), settle the structure before coding a new project or feature,
  keep root/entry files to wiring only (routing), route shared capabilities (a
  map, auth, an API client) through `inject`/`provide` or a store, and never
  trade structure away to make a feature work. It also fills per-model
  variants for DeepSeek tiers (`prefix` is the rich flagship persona,
  `deepseek-v4-flash` gets the terse pragmatic one). dsh's permission and
  approval stack is untouched: this contract is behavior, not enforcement.
- `skills/codex-review/SKILL.md` — a review skill that runs the review through
  `subagent_fork` so the parent conversation does not bias the verdict. The
  `skill-filesystem` row resolves this directory from the installed
  `codex-extras` package with `createRequire(...).resolve(...)`, so it works
  from the profile's module resolution rather than a hard-coded path.

## Layout

```
codex-extras/
  package.json                     # dsh.bundle.patch -> this package is a profile layer
  review.js                        # /review command plugin (plain ESM, dependency-free)
  fill.js                          # /fill command plugin (plain ESM, dependency-free)
  persona.js                       # model-aware persona provider (subpath ./persona)
  cordis.patch.yml                 # profile rows: registers /review and /fill
  presets/codex-style.patch.yml    # declares the codex-style agent preset
  skills/codex-review/SKILL.md     # review skill carried by the preset
```

## Install

Prereqs: a dsh profile with the base bundle (provides `commands`,
`subagents`, and the host services the preset rows consume), and `pnpm` on
PATH.

```sh
# One command installs the bundle, its /review and /fill rows, and the
# codex-style preset declaration.
dsh plugin --profile <name> add <path-to-this-directory>
# or from a git checkout directory:  dsh plugin --profile <name> add .
```

Restart the Host so the bundle patch composes, then pick the preset ("Codex
风格") when creating a session, or set it as the profile/user default under the
`agent-presets` settings namespace. No `~/.dsh/.agent-presets/` copy exists in
this version; the preset is a declaration row inside the bundle.

## Updating the harness

Because none of this lives in the harness repo, updating dsh is a plain upgrade
of the deployment — no merge, no conflicts. Two things can still need attention.
Re-run the `dsh plugin` command if the profile lost its dependencies. Then
re-check the preset declaration: its child rows name installed harness packages
and their config keys, so a release can rename or restructure them, and a row
that no longer resolves either fails to mount or mounts and silently does
nothing. The check is in [AGENTS.md](AGENTS.md).

dsh **0.2.x** is the format this checkout targets. Upgrading across that
boundary matters: directory presets under `$DSH_HOME/.agent-presets/` are no
longer read, and `context.subagents.start()` became
`context.subagents.startActivation()`. This package has already been migrated;
an older checkout must be migrated before it will mount.

## Moving to another machine

Everything here is plain files plus one profile command — nothing stores a
machine-specific path. Treat this repository as the single source of truth: on
the new machine, clone it (or copy the whole `codex-extras` directory), then
run the command against that checkout.

```sh
# on the new machine, after installing dsh and creating/choosing a profile
git clone <codex-extras-repo-url>     # or copy the codex-extras directory over
dsh plugin --profile <name> add <checkout-directory>
```

Restart the Host, then pick the preset ("Codex 风格") in a new session and try
`/review` and `/fill`.

### Letting an agent do the install

Paste the block below into a dsh session on the new machine. The agent shells
out to `dsh` for the bundle; the preset travels inside that same bundle. It
cannot lower the sandbox/approval boundary, so expect approval prompts when it
runs the profile command or writes outside its workspace.

```text
Please self-install the codex-extras bundle on this machine.

Context: codex-extras is a dsh 0.2.x profile bundle. Its patch registers the
/review and /fill commands at the profile root and declares the "codex-style"
agent preset (persona provider, single editor, review skill). No
~/.dsh/.agent-presets directory is involved.

Do, in order:
1. Locate the checkout: ask me for its path, or clone the repo if I gave a URL.
2. If unsure which profile to use, list profiles first (dsh --help), then run:
   `dsh plugin --profile <name> add <checkout-directory>`
   If pnpm is not on PATH, stop and report that instead of working around it.
3. When the sandbox denies a write or command, retry that exact step once with
   the narrowest wider sandbox_permissions plus a one-sentence justification;
   never work around a denial any other way.
4. Report back: which profile received the bundle, and what stays manual
   (restart the Host, open a session on the "Codex 风格" preset, smoke-test
   /review and /fill). If a step fails, report the exact error and stop rather
   than guessing.
```

## Removing

```sh
dsh plugin --profile <name> remove codex-extras
# the preset declaration disappears with the bundle; nothing else to delete
```

## Adding a capability

There are two mounting surfaces, and the rule decides between them:

- A **profile bundle row** (`cordis.patch.yml`) for host-plane capabilities
  available to every session (like `/review` and `/fill`), or
- a **preset row** inside `presets/codex-style.patch.yml` for per-agent
  capabilities. A preset row can name a package installed in the profile or the
  harness — not a file relative to the preset, because the declaration inherits
  the declaring Loader's base (the profile directory), not a preset directory.
  Package subpaths are the way to ship a per-preset plugin: `persona.js` is
  exported as `codex-extras/persona` for exactly this reason.

Add a plugin file to this `"type": "module"` package, export it as a subpath,
and reference that subpath from the chosen row. Both surfaces use the same
function-plugin contract: named `name` / `inject` / `apply` exports and no
default export. The legacy CommonJS preset-local form no longer applies in
0.2.x.
