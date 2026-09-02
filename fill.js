// Human-facing /fill command: spawns an independent one-shot child agent that
// fills the placeholders of a project template file (AGENTS.md by default)
// with real facts gathered from the repository, then reports what it replaced
// and what still needs the user. The child runs in its own context, so the
// fill work never consumes the parent's model turn.
//
// Like review.js this is a plain-ESM Cordis function plugin with no runtime
// imports: it consumes only the `commands` and `subagents` services the host
// composition provides. All file reading/editing happens inside the child via
// the child's own tools, so this module needs no filesystem access.
//
// Function-plugin contract: named `name` / `inject` / `apply`, no default
// export (loader builds the plugin from this namespace).

export const name = 'command-fill'
export const inject = ['commands', 'subagents']

const USAGE = 'Usage: /fill [<file>]'

// The self-contained rubric the filling child runs. Explicitly invoked by the
// user, so applying edits to the target file is authorized — the child still
// obeys the sandbox and approval rules and never invents a value.
function fillPrompt(target) {
  return [
    'You are filling placeholders in a project template file. The target is "' + (target === '' ? 'AGENTS.md (discover it in the working directory; if missing, search downward from the repo root)' : target) + '".',
    '',
    'Find the file, then identify its placeholders: tokens of the form `{{name}}`, and any clearly marked template tokens that name project facts (project name, repository, description, package/registry name, language, license, dates, owner/author).',
    '',
    'Gather real facts about THIS project from the repository itself: `git remote` (owner/repo), the repository directory name, the nearest package.json / README / pyproject.toml / Cargo.toml (name, description, keywords), language and build files, license file, and the current date. Do not guess values that nothing in the repository supports.',
    '',
    'Replace every placeholder you can infer confidently, keeping the file\'s formatting and structure intact and making the smallest edit that fills it. A token you cannot infer confidently stays as-is and must be listed at the end.',
    '',
    'The user invoked /fill, which is an explicit request to modify this file, so applying the confident edits is authorized. Still follow the sandbox rules: read the file before editing; when the sandbox denies a write, retry that exact call once with the narrowest `sandbox_permissions` plus a one-sentence `justification`; never work around a denial any other way. Approval prompts are how the user consents.',
    '',
    'Report back: the path of the file you edited; one line per replaced token in the form `token -> value`; then a "Remaining" list of tokens you left unfilled, each with a suggestion of where the user should supply the value. End with `overall`: "filled" or "needs input". If the target file has no placeholders, say so and make no edit.',
  ].join('\n')
}

// Render the child's text blocks without trusting arbitrary values.
function outputText(result) {
  return result.output
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

// A non-`completed` stop reason is a direct error, not partial success.
function stopReasonError(result) {
  const diagnostic = result.diagnostic === undefined ? '' : `\n${result.diagnostic}`
  const partial = outputText(result)
  const tail = partial.length === 0 ? '' : `\nPartial output before the run ended:\n${partial}`
  const reason = result.stopReason
  switch (reason) {
    case 'aborted':
      return `Fill cancelled.${diagnostic}${tail}`
    case 'error':
      return `The fill failed to complete.${diagnostic}${tail}`
    case 'max-tokens':
      return `The fill hit its token limit before finishing.${diagnostic}${tail}`
    case 'refusal':
      return `The filler declined the task.${diagnostic}${tail}`
    default:
      return `The fill ended abnormally (${String(reason)}).${diagnostic}${tail}`
  }
}

// Execute one /fill run with an optional target file argument.
async function executeFill(ctx, invocation, provider) {
  const target = invocation.rawInput.trim()
  if (target.length > 0 && target.startsWith('/')) return { kind: 'error', text: USAGE }
  if (ctx.subagents.getProvider(provider) === undefined) {
    return { kind: 'error', text: `Fill is unavailable: subagent provider "${provider}" is not registered.` }
  }
  let run
  try {
    run = await ctx.subagents.start(provider, {
      label: 'fill',
      prompt: [{ type: 'text', text: fillPrompt(target) }],
      parent: invocation.agent,
      signal: invocation.signal,
    })
  } catch (error) {
    if (invocation.signal.aborted) return { kind: 'error', text: 'Fill cancelled.' }
    throw error
  }
  try {
    const result = await run.result
    if (result.stopReason !== 'completed') return { kind: 'error', text: stopReasonError(result) }
    const text = outputText(result)
    if (text.trim().length === 0) return { kind: 'error', text: 'The fill produced no findings.' }
    return { kind: 'success', text }
  } catch (error) {
    if (invocation.signal.aborted) return { kind: 'error', text: 'Fill cancelled.' }
    throw error
  } finally {
    await run.dispose()
  }
}

// Register /fill for every composed human-command adapter.
export function apply(ctx, config) {
  const provider = (config && typeof config.provider === 'string' && config.provider) || 'spawn'
  const active = new Set()
  const handler = (invocation) => {
    const operation = executeFill(ctx, invocation, provider)
    active.add(operation)
    const retire = () => { active.delete(operation) }
    void operation.then(retire, retire)
    return operation
  }

  ctx.effect(function* () {
    yield async () => { await Promise.allSettled(active) }
    yield ctx.commands.register({
      name: 'fill',
      description: 'Fill placeholders in the project template (AGENTS.md by default) with real repository facts',
      handler,
    })
  }, 'command-fill lifecycle')
}
