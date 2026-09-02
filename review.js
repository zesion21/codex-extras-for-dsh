// Human-facing /review command: spawns an independent one-shot child agent to
// review the working diff and returns its findings. The child runs in its own
// context, so its verdict never enters the parent's model history.
//
// This file is a plain-ESM Cordis function plugin: it imports nothing at
// runtime and consumes only the `commands` and `subagents` services the host
// composition provides (base bundle rows), so it ships dependency-free beside
// the harness.
//
// Function-plugin contract: named `name` / `inject` / `apply`, no default
// export (loader builds the plugin from this namespace).

export const name = 'command-review'
export const inject = ['commands', 'subagents']

const USAGE = 'Usage: /review (no arguments)'

// The self-contained rubric the reviewing child runs against the working diff.
const REVIEW_PROMPT = [
  'You are reviewing the working changes in this repository. Run `git diff` (and `git status --porcelain` for untracked files) to obtain the uncommitted diff, then review it for correctness, security, performance, and maintainability.',
  '',
  'Flag a finding only when it:',
  '- meaningfully affects correctness, security, performance, or maintainability;',
  '- is discrete and actionable (not a general observation about the codebase);',
  '- was introduced by the current change (not pre-existing);',
  '- the author would plausibly fix once told.',
  '',
  'Report each finding as a `[P0]`-`[P3]` priority line (`[P0]` drop everything, `[P1]` next cycle, `[P2]` eventually, `[P3]` nice to have) followed by a one-paragraph body naming the file, line range, and why it is a bug. Keep the tone matter-of-fact; no praise. End with an `overall correctness` verdict — "patch is correct" or "patch is incorrect". If nothing qualifies, say so rather than padding the list.',
].join('\n')

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
      return `Review cancelled.${diagnostic}${tail}`
    case 'error':
      return `The review failed to complete.${diagnostic}${tail}`
    case 'max-tokens':
      return `The review hit its token limit before finishing.${diagnostic}${tail}`
    case 'refusal':
      return `The reviewer declined the task.${diagnostic}${tail}`
    // Merge-extensible union: a backend may add stop reasons; treat an unknown
    // terminal reason as a failure rather than reporting partial output as success.
    default:
      return `The review ended abnormally (${String(reason)}).${diagnostic}${tail}`
  }
}

// Execute one argument-free independent review of the working diff.
async function executeReview(ctx, invocation, provider) {
  if (invocation.rawInput.trim().length > 0) return { kind: 'error', text: USAGE }
  if (ctx.subagents.getProvider(provider) === undefined) {
    return { kind: 'error', text: `Review is unavailable: subagent provider "${provider}" is not registered.` }
  }
  let run
  try {
    run = await ctx.subagents.start(provider, {
      label: 'review',
      prompt: [{ type: 'text', text: REVIEW_PROMPT }],
      parent: invocation.agent,
      signal: invocation.signal,
    })
  } catch (error) {
    if (invocation.signal.aborted) return { kind: 'error', text: 'Review cancelled.' }
    throw error
  }
  try {
    const result = await run.result
    if (result.stopReason !== 'completed') return { kind: 'error', text: stopReasonError(result) }
    const text = outputText(result)
    if (text.trim().length === 0) return { kind: 'error', text: 'The review produced no findings.' }
    return { kind: 'success', text }
  } catch (error) {
    if (invocation.signal.aborted) return { kind: 'error', text: 'Review cancelled.' }
    throw error
  } finally {
    await run.dispose()
  }
}

// Register /review for every composed human-command adapter.
export function apply(ctx, config) {
  const provider = (config && typeof config.provider === 'string' && config.provider) || 'spawn'
  const active = new Set()
  const handler = (invocation) => {
    const operation = executeReview(ctx, invocation, provider)
    active.add(operation)
    const retire = () => { active.delete(operation) }
    // Both branches retire without rethrowing, so the derived observer promise
    // cannot become an unhandled mirror of an expected handler rejection.
    void operation.then(retire, retire)
    return operation
  }

  ctx.effect(function* () {
    // Yield drain before registration: composite teardown is LIFO, so no new
    // invocation can enter while already-started handler promises quiesce.
    yield async () => { await Promise.allSettled(active) }
    yield ctx.commands.register({
      name: 'review',
      description: 'Review the working diff with an independent agent',
      handler,
    })
  }, 'command-review lifecycle')
}
