# AGENTS.md

Agent-facing rules for this repository: what to know before reading anything
else, and the invariants that are easy to get silently wrong.

User-facing documentation — what this package provides, how to install it, which
mounting surface a new capability belongs on, the ESM-vs-CJS module rule — is
[README.md](README.md) ([中文](README.zh.md)). **Do not restate the README here.**
A fact has one home; this file points at it.

## What this repository is

A **user-owned** dsh profile bundle, kept deliberately outside the harness
repository so a `dsh` upgrade never conflicts with it. Everything reaches a
running harness through one of two surfaces:

- `/review` and `/fill` — profile bundle rows in `cordis.patch.yml`.
- `preset/codex-style/` — the source of the companion `codex-style` agent preset,
  installed by copying that directory into `$DSH_HOME/.agent-presets/`.

The design constraint is absolute: **this repository must stay installable
without editing the harness.** If a change seems to require a harness edit, the
change is wrong, or it belongs upstream as a separate contribution. Never reach
into a dsh checkout or install to make this package work.

## Rules

**1. `preset/codex-style/` is the only source of truth for the preset.** The
installed directory is a *copy*: nothing keeps it in sync, and a
`codex-style.bak-*` sibling there is a stale backup. Never edit an installed copy
or a backup in place — edit the preset here, then copy the whole directory over,
`plugins/` and `skills/` included. Rename or delete a file here and the installed
copy silently keeps the stale one.

```sh
diff -rq preset/codex-style "${DSH_HOME:-$HOME/.dsh}/.agent-presets/codex-style"
```

**2. The preset is live configuration, not prose.** Rows in
`preset/codex-style/agent.cordis.yml` are what a session actually runs on. On the
maintainer's machine `~/.dsh/settings.yaml` sets `agent-presets.default:
codex-style`, so a broken row breaks every new session there — including the
session making the change. Edit a row only for the reason you were asked to, and
read the comments around it first: they carry the plane, realm, and
module-format reasoning, and they are the record of *why* the row looks the way
it does.

**3. A harness upgrade can invalidate the preset.** Every row names an
`@deepseek-ai/dsh-*` package and its config keys, and the harness may rename or
restructure them; this preset is version-coupled to the dsh release it was last
adapted to. After upgrading dsh, re-check each row against the installed harness
— not merely whether the bundle patch still composes. A row whose package is gone
fails to mount; a row whose config keys changed can mount and then do nothing.

```sh
# missing packages only — changed config keys still need the row read by hand
nm="${DSH_HOME:-$HOME/.dsh}/profiles/node_modules"
grep -o '@deepseek-ai/dsh-[a-z-]*' preset/codex-style/agent.cordis.yml | sort -u |
  while read -r p; do [ -d "$nm/$p" ] || echo "MISSING $p"; done
```

The README's *Updating the harness* section states the user-facing half of this.

**4. `/review` and `/fill` are human commands.** A person types them; no agent
tool invokes them, and no row here should try to. `review.js` and `fill.js` live
in this `"type": "module"` package, so they are plain ESM with named
`name`/`inject`/`apply` exports and no default export — the opposite of a
preset-local plugin file, which the loader `require()`s and which must be
CommonJS. Consult the README's module rule before adding a plugin file to either
surface; it is the most common way to add something that mounts and then fails.

**5. There is no build, test, or lint.** `package.json` declares no `scripts`,
and none of this code is compiled. Do not add or invent a test runner to satisfy
a change, and do not report a change as verified because nothing errored.
Verification here is manual and end-to-end: the `diff -rq` above, then restart
the Host and smoke-test `/review` and `/fill` in a session on the "Codex 风格"
preset.

**6. Record a decision where it belongs, not in a new file.** A choice about a
row goes in that row's comment; a fact about how the package is provided,
installed, or used goes in the README section that already owns it — the
*What it provides* section carries the shelved `tools` `search` decision as
precedent. `README.md` and `README.zh.md` are one document in two languages:
a change to one is incomplete until the other matches.
