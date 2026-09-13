// Human-facing /fill command: asks the human for the project facts a template
// cannot supply, then spawns an independent one-shot child agent that fills the
// placeholders of a project template file (AGENTS.md by default) with those
// answers plus the facts the repository itself carries. The child runs in its
// own context, so the fill work never consumes the parent's model turn.
//
// Why the questions are asked HERE and not inside the child: a live child agent
// owned by another agent cannot call ask_user_question (`dsh-tool-ask-user`
// rejects it with DELEGATED_CALLER and expects unresolved questions in the
// child's final result). The command handler is the only party that can reach
// the human: `dsh-commands` returns CommandResult, which has no interactive
// variant, but the `userQuestions` seam admits exactly one caller shape — the
// agent passed in must be the registry's exact live runtime root, and
// `invocation.agent` is that root. So the handler asks and hands the answers to
// the child as prompt text; it never tries to ask from inside the child.
//
// The questionnaire exists because the template's placeholders are product
// decisions (purpose, type, stack, conventions), not repository facts. On a
// freshly cloned template the repository supports none of them, so a
// repository-only fill reports almost every placeholder as unfilled.
//
// Like review.js this is a plain-ESM Cordis function plugin with no runtime
// imports: it consumes the `commands` and `subagents` services the host
// composition provides and reads `userQuestions` optionally, degrading to a
// repository-only fill when the seam is absent. All file reading/editing
// happens inside the child via the child's own tools, so this module needs no
// filesystem access.
//
// Function-plugin contract: named `name` / `inject` / `apply`, no default
// export (loader builds the plugin from this namespace).

export const name = 'command-fill'
export const inject = ['commands', 'subagents']

const USAGE = 'Usage: /fill [<file>]'

// The questionnaire. Each item covers placeholders the repository cannot answer.
// `options` are quick picks only: the question composer always renders a
// free-text input beside them and returns both `selected` and `custom`, so an
// option never constrains the answer. Labels and descriptions are Chinese to
// match the project template they fill.
const PROJECT_QUESTIONS = [
  {
    id: 'purpose',
    header: '项目目的',
    question: '简要描述这个项目的核心功能和构建目的',
    detail: '一两句话即可。如果目标用户群体已经明确，请在这里一并说明——模板里的「目标用户」是一个独立占位符，答不到就不会被填。',
  },
  {
    id: 'stack',
    header: '类型与技术栈',
    question: '项目类型和技术栈是什么？',
    detail: '请覆盖：项目类型（Web 应用／移动端／桌面应用／数据分析／其他）、前端、后端、数据库、其他技术。可直接选一个预设组合，也可以自己输入；补充差异也请写在这里。',
    options: [
      {
        label: 'Web 应用 · Vue 3 + TypeScript + Ant Design Vue / Midway.js + SQLite3',
        description: '模板默认全栈组合，对应 frontend 与 backend-midway 技能',
      },
      {
        label: 'Web 应用 · Vue 3 + TypeScript + Ant Design Vue / Python FastAPI + PostgreSQL',
        description: '对应 frontend、python-pro、postgresql-designer 技能',
      },
      { label: '桌面应用 · Electron + Vue 3', description: '对应 electron 技能' },
      { label: '移动端 · UniApp', description: '对应 uniapp-architect 技能' },
      { label: '数据分析 / 脚本 · Python', description: '对应 python-pro 技能' },
    ],
  },
  {
    id: 'constraints',
    header: '自定义约束',
    question: '还有哪些本项目特有的约定或约束？',
    detail: '例如：优先兼容 Chrome 浏览器、数据库字段统一 snake_case、时区统一 Asia/Shanghai。没有特殊约定就选「暂无特殊约定」。',
    options: [{ label: '暂无特殊约定' }],
  },
]

// Collect the questionnaire answers into prompt text. Returns why it could not
// run instead of throwing, so a deployment without the seam still gets the
// repository-only fill with the gap stated in the report.
async function askProjectFacts(ctx, invocation) {
  const userQuestions = ctx.get('userQuestions')
  if (userQuestions === undefined) {
    return { kind: 'unavailable', reason: 'the userQuestions seam is not mounted in this deployment' }
  }
  try {
    const answer = await userQuestions.ask({
      questions: PROJECT_QUESTIONS,
      agent: invocation.agent,
      signal: invocation.signal,
    })
    return { kind: 'answered', text: renderAnswers(answer) }
  } catch (error) {
    if (invocation.signal.aborted) return { kind: 'aborted' }
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
  }
}

// Read only the leaves the composer can produce — the selected option labels and
// the typed custom string — and render them question by question.
function renderAnswers(answer) {
  const items = Array.isArray(answer.answers) ? answer.answers : []
  const lines = PROJECT_QUESTIONS.map((question) => {
    const item = items.find((candidate) => candidate.id === question.id)
    const selected = item !== undefined && Array.isArray(item.selected) ? item.selected : []
    const custom = item !== undefined && typeof item.custom === 'string' ? item.custom.trim() : ''
    const parts = custom.length === 0 ? [...selected] : [...selected, custom]
    const value = parts.join('；').trim()
    return '- ' + question.header + '：' + (value.length === 0 ? '(未回答)' : value)
  })
  return lines.join('\n')
}

// The self-contained rubric the filling child runs. Explicitly invoked by the
// user, so applying edits to the target file is authorized — the child still
// obeys the sandbox and approval rules and never invents a value.
function fillPrompt(target, facts) {
  return [
    'You are filling placeholders in a project template file. The target is "' + (target === '' ? 'AGENTS.md (discover it in the working directory; if missing, search downward from the repo root)' : target) + '".',
    '',
    'Find the file, then identify its placeholders: tokens of the form `{{name}}`, and any clearly marked template tokens that name project facts (project name, type, tech stack, description, target users, repository/root directory, version, license, dates, owner/author, project-specific conventions).',
    '',
    ...(facts === undefined
      ? ['No questionnaire answers are available for this run, so fill only what the repository itself supports.']
      : [
          'The human answered a questionnaire about this project before you started. Treat every answer as an authoritative project decision — it is exactly what the repository cannot tell you:',
          '',
          facts,
        ]),
    '',
    'Gather the remaining facts about THIS project from the repository itself: `git remote` (owner/repo), the repository directory name, the nearest package.json / README / pyproject.toml / Cargo.toml (name, description, keywords), language and build files, license file, and the current date. Do not guess a value that neither the answers nor the repository supports.',
    '',
    'Derive what the answers already imply instead of asking again or leaving it blank: the project name and the root-directory token from the repository directory name, a starting version (v0.1.0) when nothing states one, the per-layer "tech stack description" prose from the answered stack, and the project type from the answered stack.',
    '',
    'The template ships a generic "project structure" block that assumes a full-stack layout. Reconcile that block with the answered stack: keep the directories this project will actually have, drop the subtrees the answers rule out (for example the frontend tree for a backend-only or script project), and keep the documentation tree the template already provides. A structure block that describes directories the project will not have misleads every later agent.',
    '',
    'Replace every placeholder you can infer confidently, keeping the file\'s formatting and structure intact and making the smallest edit that fills it. A token you cannot infer confidently stays as-is and must be listed at the end; the target-user token is the usual case when the answers did not cover it.',
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

  // Ask before spawning, and never let a broken questionnaire block the fill:
  // a stated gap in the report beats a silent empty file.
  const asked = await askProjectFacts(ctx, invocation)
  if (asked.kind === 'aborted') return { kind: 'error', text: 'Fill cancelled.' }
  const warning = asked.kind === 'answered'
    ? ''
    : `Note: the project questionnaire did not run (${asked.reason}). Filling from repository facts only.\n\n`

  let run
  try {
    run = await ctx.subagents.start(provider, {
      label: 'fill',
      prompt: [{ type: 'text', text: fillPrompt(target, asked.kind === 'answered' ? asked.text : undefined) }],
      parent: invocation.agent,
      signal: invocation.signal,
    })
  } catch (error) {
    if (invocation.signal.aborted) return { kind: 'error', text: `${warning}Fill cancelled.` }
    throw error
  }
  try {
    const result = await run.result
    if (result.stopReason !== 'completed') return { kind: 'error', text: warning + stopReasonError(result) }
    const text = outputText(result)
    if (text.trim().length === 0) return { kind: 'error', text: `${warning}The fill produced no findings.` }
    return { kind: 'success', text: warning + text }
  } catch (error) {
    if (invocation.signal.aborted) return { kind: 'error', text: `${warning}Fill cancelled.` }
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
      description: 'Ask for the project facts, then fill the template placeholders (AGENTS.md by default)',
      handler,
    })
  }, 'command-fill lifecycle')
}
