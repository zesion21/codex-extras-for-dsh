// Model-aware persona provider carried by the codex-style preset.
//
// This is a standalone equivalent of the dsh-persona row plus per-model
// variants. It ships as a FILE INSIDE the preset directory because of two
// composition rules:
//   - the persona section is scope-only: registering it globally (a profile
//     bundle row) collides with the prompt registry's own registration and
//     fails loud, so the provider must mount under one agent preset;
//   - a preset row can name either a file the preset ships (`./plugins/…`) or
//     a package installed in the harness — never a profile-installed bundle —
//     so a per-preset provider has to be a file the preset carries.
//
// CommonJS on purpose: preset file rows are loaded with Node `require()`. A
// user-home preset directory has no `package.json` `"type": "module"`, so an
// ESM-syntax `.js` file there is detected as an ES Module and `require(esm)`
// inside the loader's cycle fails ("Cannot require() ES Module … in a
// cycle"). `module.exports` keeps this file loadable through both `require()`
// and dynamic `import()` (which exposes it as `default` plus detected named
// exports).
//
// A persona is TWO sections in the current registry, not one:
// `deployment:persona-prefix` (persona prose) and `deployment:persona-suffix`
// (first-party guidance rendered after it). The registry registers both
// globally from its own `personaPrefix`/`personaSuffix` config, so replacing a
// persona means shadowing both by name inside the agent scope — registering
// only a prefix leaves the deployment's suffix trailing this preset's text.
//
// The section names below are the literal values of
// @deepseek-ai/dsh-system-prompt's PERSONA_PREFIX_SECTION and
// PERSONA_SUFFIX_SECTION constants, and the order values come from that
// package's own allocation table via `getSectionOrder`. Both are kept as
// registry lookups rather than literals: a bare package import would not
// resolve from a user-home preset file, and hard-coding an order would drift
// when the registry reallocates positions.

'use strict'

/** Plugin name (function-plugin contract). */
const name = 'persona'

/** The prompt registry this row contributes to. */
const inject = ['systemPrompt']

/** Section name shared with @deepseek-ai/dsh-system-prompt's PERSONA_PREFIX_SECTION. */
const PERSONA_PREFIX_SECTION = 'deployment:persona-prefix'

/** Section name shared with @deepseek-ai/dsh-system-prompt's PERSONA_SUFFIX_SECTION. */
const PERSONA_SUFFIX_SECTION = 'deployment:persona-suffix'

/**
 * Select the persona text for the resolved model. An exact model id wins, then
 * the `*` wildcard, then the fallback `prefix`. `context.agent` is absent on
 * cold assemblies with no agent, so the fallback covers that too.
 */
function selectText(prefix, variants, context) {
  if (variants === undefined) return prefix
  const model = context && context.agent && context.agent.options && context.agent.options.model
  if (typeof model !== 'string') return prefix
  if (Object.hasOwn(variants, model)) return variants[model]
  if (Object.hasOwn(variants, '*')) return variants['*']
  return prefix
}

/**
 * Register the persona prefix and suffix sections for the mounting context's
 * scope.
 * @param ctx - an agent scope context; an unscoped context collides with the
 * prompt registry's own persona registration and rejects.
 * @param config - `prefix` (persona prose, fallback text), optional `suffix`
 * (defaults to `''`, shadowing the deployment suffix), optional `variants`
 * (model-id or `*` -> persona text), `complete`, `includeRuntimeContext` —
 * same fields as the dsh-persona row, minus schema validation.
 */
function apply(ctx, config) {
  const cfg = config || {}
  const prefix = typeof cfg.prefix === 'string' ? cfg.prefix : ''
  const suffix = typeof cfg.suffix === 'string' ? cfg.suffix : ''
  const variants = cfg.variants
  const render = variants === undefined
    ? prefix
    : (context) => selectText(prefix, variants, context)
  ctx.effect(() => ctx.systemPrompt.section({
    name: PERSONA_PREFIX_SECTION,
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
    text: render,
    ...(cfg.complete === true ? { complete: true } : {}),
  }), 'persona.section()')
  ctx.effect(() => ctx.systemPrompt.section({
    name: PERSONA_SUFFIX_SECTION,
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'),
    text: suffix,
  }), 'persona.suffix()')
  if (cfg.includeRuntimeContext === false) ctx.systemPrompt.suppressRuntimeContext()
}

module.exports = { name, inject, apply }
