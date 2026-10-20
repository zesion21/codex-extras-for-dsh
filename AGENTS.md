# AGENTS.md

Agent-facing rules for this repository: what to know before reading anything
else, and the invariants that are easy to get silently wrong.

User-facing documentation — what this package provides, how to install it, which
mounting surface a new capability belongs on, and the package-subpath rule — is
[README.md](README.md) ([中文](README.zh.md)). **Do not restate the README here.**
A fact has one home; this file points at it.

## What this repository is

A **user-owned** dsh profile bundle, kept deliberately outside the harness
repository so a `dsh` upgrade never conflicts with it. Everything reaches a
running harness through one installed bundle:

- `/review` and `/fill` — profile bundle rows in `cordis.patch.yml`.
- `codex-style` — an `@deepseek-ai/dsh-agent-preset` declaration in
  `presets/codex-style.patch.yml`, plus its persona provider (`persona.js`,
  exported as `codex-extras/persona`) and review skill (`skills/`).

The design constraint is absolute: **this repository must stay installable
without editing the harness.** If a change seems to require a harness edit, the
change is wrong, or it belongs upstream as a separate contribution. Never reach
into a dsh checkout or install to make this package work.

This checkout targets dsh **0.2.x**. A directory preset under
`$DSH_HOME/.agent-presets/` is dead configuration in this release: presets are
declaration rows, and the declaration's child rows resolve against the
declaring Loader's base (the profile directory). That is why the persona
provider is a package subpath, not a preset-local file.

## Rules

**1. `presets/codex-style.patch.yml` is the only source of truth for the
preset.** Installation copies nothing: the profile links this package, so the
installed preset is read from this checkout. Edit the declaration here, then
reinstall or restart; never look for an installed copy under
`$DSH_HOME/.agent-presets/`.

**2. The preset is live configuration, not prose.** Child rows name installed
`@deepseek-ai/dsh-*` packages and their config keys, so the preset is
version-coupled to the dsh release it was last adapted to. Edit a row only for
the reason you were asked to, and read the comments around it first. A row
whose package is gone fails to mount; a row whose config keys changed can mount
and then do nothing.

**3. A harness upgrade can invalidate the preset.** After upgrading dsh,
re-check every row against the installed harness — not merely whether the
bundle patch still composes.

```sh
nm="${DSH_HOME:-$HOME/.dsh}/profiles/<name>/node_modules"
# harness packages resolve from the dsh installation, not the profile; check
# both the installation and the profile
anchor="$(dirname "$(dirname "$(command -v dsh)")")/lib/node_modules/@deepseek-ai/dsh/node_modules"
grep -o '@deepseek-ai/dsh-[a-z-]*' presets/codex-style.patch.yml | sort -u |
  while read -r p; do [ -d "$nm/$p" ] || [ -d "$anchor/$p" ] || echo "MISSING $p"; done
```

**4. `/review` and `/fill` are human commands.** A person types them; no agent
tool invokes them, and no row here should try to. Both consume the host
`commands` and `subagents` services and call
`ctx.subagents.startActivation({ provider, label, request, signal, delivery })`.
That API replaced the 0.1.x `start(provider, request)` shape; do not reintroduce
the old call.

**5. There is no build, test, or lint.** `package.json` declares no `scripts`,
and none of this code is compiled. Do not add or invent a test runner to satisfy
a change, and do not report a change as verified because nothing errored.
Verification here is manual and end-to-end: `dsh --profile <name> --dump-config`,
then boot the profile and confirm the `codex-style` preset has no `broken`
diagnostic and its inspection lists the expected modules. Finish with a real
smoke test of `/review` and `/fill` in a session on the preset.

**6. Record a decision where it belongs, not in a new file.** A choice about a
row goes in that row's comment; a fact about how the package is provided,
installed, or used goes in the README section that already owns it. `README.md`
and `README.zh.md` are one document in two languages: a change to one is
incomplete until the other matches.
