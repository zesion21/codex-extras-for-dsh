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
// `deployment:persona` below is the literal value of the `PERSONA_SECTION`
// constant that @deepseek-ai/dsh-system-prompt exports; a bare package import
// would not resolve from a user-home preset file, so the constant is kept
// literal. Registering the same section name inside an agent scope shadows the
// deployment persona exactly like the dsh-persona row does.

'use strict'

/** Plugin name (function-plugin contract). */
const name = 'persona'

/** The prompt registry this row contributes to. */
const inject = ['systemPrompt']

/** Section name shared with @deepseek-ai/dsh-system-prompt's PERSONA_SECTION. */
const PERSONA_SECTION = 'deployment:persona'

/**
 * Select the persona text for the resolved model. An exact model id wins, then
 * the `*` wildcard, then the fallback `text`. `context.agent` is absent on
 * cold assemblies with no agent, so the fallback covers that too.
 */
function selectText(text, variants, context) {
  if (variants === undefined) return text
  const model = context && context.agent && context.agent.options && context.agent.options.model
  if (typeof model !== 'string') return text
  if (Object.hasOwn(variants, model)) return variants[model]
  if (Object.hasOwn(variants, '*')) return variants['*']
  return text
}

/**
 * Register the persona section for the mounting context's scope.
 * @param ctx - an agent scope context; an unscoped context collides with the
 * prompt registry's own persona registration and rejects.
 * @param config - `text` (fallback persona), optional `variants` (model-id or
 * `*` -> persona text), `complete`, `includeRuntimeContext` — same fields as
 * the dsh-persona row, minus schema validation.
 */
function apply(ctx, config) {
  const cfg = config || {}
  const text = typeof cfg.text === 'string' ? cfg.text : ''
  const variants = cfg.variants
  const render = variants === undefined
    ? text
    : (context) => selectText(text, variants, context)
  ctx.effect(() => ctx.systemPrompt.section({
    name: PERSONA_SECTION,
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA'),
    text: render,
    ...(cfg.complete === true ? { complete: true } : {}),
  }), 'persona.section()')
  if (cfg.includeRuntimeContext === false) ctx.systemPrompt.suppressRuntimeContext()
}

module.exports = { name, inject, apply }
