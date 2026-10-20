// Model-aware persona provider shipped by the codex-extras bundle.
//
// This is a standalone equivalent of the dsh-persona row plus per-model
// variants. It is a PACKAGE SUBPATH (`codex-extras/persona`) rather than a
// preset-local file because dsh 0.2.x mounts agent presets as declaration rows
// inside a bundle patch: a declaration's child rows inherit the DECLARING
// Loader's resolution base (the profile directory), so `./plugins/persona.js`
// inside a preset directory no longer resolves. The profile has this package
// installed, so a bare subpath resolves there.
//
// ESM on purpose: this package is `"type": "module"`, and dsh's Loader imports
// relative/package rows with `import()`. The previous directory-preset file was
// CommonJS because the legacy loader `require()`d preset files.
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
// package's own allocation table via `getSectionOrder`.

/** Plugin name (function-plugin contract). */
export const name = 'persona'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

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
export function apply(ctx, config) {
  const cfg = config || {}
  const prefix = typeof cfg.prefix === 'string' ? cfg.prefix : ''
  const suffix = typeof cfg.suffix === 'string' ? cfg.suffix : ''
  const variants = cfg.variants
  const render = variants === undefined
    ? prefix
    : (context) => selectText(prefix, variants, context)
  // dsh 0.2.x registers only `provider` and `model` as prompt variables; the
  // persona templates also reference `{{cwd}}`, so this scoped provider
  // supplies it from the assembling agent's session header. A scoped variable
  // shadows a global one, so this stays correct if the harness later adds its
  // own `cwd`.
  ctx.effect(() => ctx.systemPrompt.variable('cwd', (context) => {
    const cwd = context?.agent?.session?.header?.cwd
    return typeof cwd === 'string' ? cwd : undefined
  }), 'persona.variable(cwd)')
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
