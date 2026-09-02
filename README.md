# codex-extras

User-owned profile bundle for DeepSeek Harness: codex-style capabilities that
live **outside** the harness repository, so upstream updates never conflict
with them. Currently provides the human `/review` and `/fill` commands
(profile bundle) and carries the source of the companion `codex-style` agent
preset, whose persona provider and review skill ship inside the preset
directory. The `tools` `search` disclosure mode was deliberately shelved: it
changes the `dsh-tools` registry internals and has no plugin seam, so it is
not part of this package.

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
template file with real repository facts. It is meant for workflows that start
from a cloned template: run `/fill` after cloning and an independent child
agent reads `AGENTS.md` (or the file you name, `/fill <file>`), replaces every
placeholder it can infer confidently from the repository (git remote, package
name/description, language, license, dates), leaves ambiguous tokens for you,
and reports `token -> value` plus a "Remaining" list. Invoking `/fill` is the
explicit request that authorizes the edits; the child still follows the
sandbox and approval rules and never invents a value.

### `codex-style` agent preset (preset directory)

The preset in `preset/codex-style/` layers a Codex-shaped persona, the single
`str_replace_editor`, and the `codex-review` skill on top of the full `standard`
tool surface. It is installed by copying the directory into
`~/.dsh/.agent-presets/codex-style` — no repository changes, no roster
registration, no conflicts with upstream.

Inside the preset, two capabilities are **preset-local files**, by composition
rule rather than choice:

- `plugins/persona.js` — the persona provider. It is a standalone equivalent
  of the `dsh-persona` row plus per-model `variants`: a map from a resolved
  model id (or `*`) to persona text; exact id wins, then `*`, then `text`.
  A preset row can name only a file the preset ships or a harness-installed
  package, and the persona section is scope-only (a global registration
  collides with the prompt registry), so the provider must be a file under the
  preset directory rather than a profile-bundle row. Configure `variants` in
  the preset's `agent.cordis.yml` under the `persona` row. The shipped persona
  carries an **engineering contract** in every tier: ask before you write (edit
  only when the user explicitly asked, otherwise research and offer options
  first), never assume intent, and architecture first — orchestrate the whole
  task (统筹), settle the structure before coding a new project or feature,
  keep root/entry files to wiring only (routing), route shared capabilities (a
  map, auth, an API client) through `inject`/`provide` or a store, and never
  trade structure away to make a feature work. It also fills per-model
  variants for DeepSeek tiers (`text` is the rich flagship persona,
  `deepseek-v4-flash` gets the terse pragmatic one). dsh's permission and
  approval stack is untouched: this contract is behavior, not enforcement.
- `skills/codex-review/SKILL.md` — a review skill that runs the review through
  `subagent_fork` so the parent conversation does not bias the verdict.

## Layout

```
codex-extras/
  package.json            # declares dsh.bundle.patch -> this package is a profile layer
  review.js               # /review command plugin (plain ESM, dependency-free)
  fill.js                 # /fill command plugin (plain ESM, dependency-free)
  cordis.patch.yml        # profile rows: registers /review and /fill at the profile root
  preset/codex-style/     # source of the local agent preset (installed separately)
    agent.cordis.yml
    preset.yml
    plugins/persona.js    # model-aware persona provider (file row ./plugins/persona.js)
    skills/codex-review/SKILL.md
```

## Install

Prereqs: a dsh profile with the base bundle (provides `commands` and
`subagents`), and `pnpm` on PATH.

```sh
# 1) bundle: /review and /fill become available to every session of the profile
dsh plugin --profile <name> add <path-to-this-directory>
# or from a git checkout directory:  dsh plugin --profile <name> add .

# 2) preset: install the companion agent preset
mkdir -p "$HOME/.dsh/.agent-presets/codex-style"   # Windows: %USERPROFILE%\.dsh\.agent-presets\codex-style
cp -R preset/codex-style/. <target>
```

Restart the Host so the bundle patch composes, then pick the preset ("Codex
风格") when creating a session, or set it as the profile/user default under the
`agent-presets` settings namespace.

## Updating the harness

Because none of this lives in the harness repo, updating dsh is a plain upgrade
of the deployment. After an upgrade, re-run the `dsh plugin` command only if
the profile lost its dependencies; the preset directory needs no action.

## Moving to another machine

Everything here is plain files plus one profile command — nothing stores a
machine-specific path. The move is: install dsh, copy the preset directory,
install the bundle. Treat this repository as the single source of truth: on the
new machine, clone it (or copy the whole `codex-extras` directory), then run the
steps against that checkout.

```sh
# on the new machine, after installing dsh and creating/choosing a profile
git clone <codex-extras-repo-url>     # or copy the codex-extras directory over
dsh plugin --profile <name> add <checkout-directory>

# preset: copy the WHOLE preset/codex-style directory (plugins/ and skills/ included)
#   Windows:   %USERPROFILE%\.dsh\.agent-presets\codex-style
#   macOS/Linux: $HOME/.dsh/.agent-presets/codex-style
#   ($DSH_HOME overrides the `.dsh` home when set)
```

Restart the Host, then pick the preset ("Codex 风格") in a new session and try
`/review` and `/fill`.

### Letting an agent do the install

Paste the block below into a dsh session on the new machine. The agent shells
out to `dsh` for the bundle and writes the preset directory itself. It cannot
lower the sandbox/approval boundary, so expect approval prompts when it writes
outside its workspace or runs the profile command.

```text
Please self-install my codex-style agent preset and the codex-extras plugin on
this machine.

Context: codex-extras is a dsh profile bundle whose checkout also carries the
codex-style preset source under preset/codex-style/. The preset must land in
<dshHome>/.agent-presets/codex-style (dshHome = $DSH_HOME, else the user home's
.dsh); the bundle must be added to a profile so its /review and /fill commands
register and a session on the preset gets the persona provider, single editor,
and review skill.

Do, in order:
1. Locate the checkout: ask me for its path, or clone the repo if I gave a URL.
2. If unsure which profile to use, list profiles first (dsh --help), then run:
   `dsh plugin --profile <name> add <checkout-directory>`
   If pnpm is not on PATH, stop and report that instead of working around it.
3. Copy the whole preset/codex-style/ directory (agent.cordis.yml, preset.yml,
   plugins/, skills/) into <dshHome>/.agent-presets/codex-style. Back up any
   existing copy before replacing it.
4. When the sandbox denies a write or command, retry that exact step once with
   the narrowest wider sandbox_permissions plus a one-sentence justification;
   never work around a denial any other way.
5. Report back: which profile received the bundle, the preset path, and what
   stays manual (restart the Host, open a session on the "Codex 风格" preset,
   smoke-test /review and /fill). If a step fails, report the exact error and
   stop rather than guessing.
```

## Removing

```sh
dsh plugin --profile <name> remove codex-extras
# and delete the preset directory ~/.dsh/.agent-presets/codex-style
```

## Adding a capability

There are two mounting surfaces, and the rule decides between them:

- A **profile bundle row** (`cordis.patch.yml`) for host-plane capabilities
  available to every session (like `/review` and `/fill`), or
- a **preset row** for per-agent capabilities. A preset row can name either a
  file the preset ships (`./plugins/…`) or a package installed in the harness
  — not a profile-installed bundle — so per-agent plugins that cannot be a
  harness package travel as files inside the preset directory (like
  `plugins/persona.js`).

Add a plugin file and reference it from the chosen row. The module format
depends on the mounting surface: plugin files inside this bundle package
(which is `"type": "module"`) are ESM with named `name` / `inject` / `apply`
exports and no default export; **preset-local plugin files** (referenced from a
preset row as `./plugins/…` and living under a user-home directory with no
`package.json`) must be CommonJS — `module.exports = { name, inject, apply }` —
because the loader `require()`s them, and an ESM-syntax `.js` there is
detected as an ES Module and fails with a `require(esm)` cycle error (see
`plugins/persona.js`). Both forms expose the same function-plugin fields.
