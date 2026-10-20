# codex-extras

为 DeepSeek Harness 自建的 profile bundle:codex 风格能力,**全部在 harness 仓库之外**,上游更新永远不会与它冲突。提供人肉 `/review` 与 `/fill` 命令,并声明配套 `codex-style` agent 预设(含按模型切换的 persona 提供者与 review skill)。`tools` 的 `search` 披露模式被有意搁置:它需要改动 `dsh-tools` 注册表内部、没有插件扩展缝,不属于本包。

本 checkout 面向 dsh **0.2.x**:agent 预设已经是 bundle patch 里的 `@deepseek-ai/dsh-agent-preset` 声明行,不再是 `$DSH_HOME/.agent-presets/<id>/` 目录;harness 也不再把后者当作预设读取。同时子 agent 启动 API 从 `subagents.start()` 变为 `subagents.startActivation()`。两处均已迁移。

## 提供什么

### `/review` 命令(profile bundle)

人肉斜杠命令:派一个独立的 one-shot 子 agent(`ctx.subagents`,默认 provider `spawn`)评审工作区 diff 并返回发现。子 agent 在自己的上下文里运行,结论不会进入父会话的模型历史。它是纯 ESM 的 Cordis 函数插件(`review.js`),**零运行时依赖**,只消费 base bundle 提供的 `commands` 与 `subagents` 服务。行放在 `cordis.patch.yml`(profile 根),与 base bundle 注册 `/goal`、`/compact` 同层。

### `/fill` 命令(profile bundle)

人肉斜杠命令(`fill.js`):填充项目模板文件里的占位符。它面向"克隆模板再开发"的工作流,并且**先问再写**:模板里的占位符是产品决策,而刚克隆的仓库对这些一个都支持不了,所以只从仓库推导的填充会把几乎所有占位符都报成未填。

克隆后敲 `/fill`:命令本身通过 `userQuestions` seam 问三个问题——项目目的、项目类型与技术栈、项目特有的约束——然后派一个独立子 agent,用这些答案加上仓库真实携带的事实(git remote、package 名/描述、语言、license、日期)填充 `AGENTS.md`(或你指定的文件,`/fill <file>`)。子 agent 会推导答案已经隐含的值(项目名称与根目录取自目录名、起始版本、各层技术栈描述、项目类型),并按回答的技术栈裁剪模板里那份通用「项目结构」块,避免描述一个项目不会有的目录树。最后报告 `token -> value` 与 "Remaining" 列表,绝不编造值。

提问由命令而非子 agent 发起,因为被其他 agent 拥有的子 agent 无法调用 `ask_user_question`。当该 seam 不可用或提问失败时,`/fill` 不会卡住:它会说明这一缺口并退化为只从仓库推导的填充。敲 `/fill` 本身就是明确的修改授权;子 agent 仍遵守沙箱与审批规则。

### `codex-style` agent 预设(bundle 声明)

`presets/codex-style.patch.yml` 插入一条 id 为 `codex-style` 的
`@deepseek-ai/dsh-agent-preset` 声明行,在完整 `standard` 工具面之上叠加
codex 形态的 persona、`str_replace_editor` 单编辑器与 `codex-review` skill。
它和命令由同一条 `dsh plugin add` 安装——无需登记 roster、无需单独复制目录,
也不改 harness 仓库。

两个能力由本包承载,而不是预设目录:

- `persona.js`(包子路径 `codex-extras/persona`)—— persona 提供者。它是
  `dsh-persona` 行加按模型 `variants` 的独立等价实现:从"解析出的模型 id
  (或 `*`)→ persona 文本"映射,精确 id 优先、其次 `*`、最后回退 `prefix`。
  0.2.x 的预设声明按"声明方 Loader 的 base"(即 profile 目录)解析子行,
  `./plugins/…` 这类预设本地文件不再能解析,所以提供者必须是已安装的包,
  本 bundle 就是那个包。`variants` 在 `presets/codex-style.patch.yml` 的
  `persona` 行配置。预设自带 persona 携带完整工程师契约:`prefix` 为旗舰
  完整版,`deepseek-v4-flash` 使用精简务实版:
  - **先问再写**:只有用户明确要求改动才直接改;探索/讨论状态先检索
    (grep/glob)再给可选项,待用户确认后动手;
  - **不臆断**:请求含糊或决策属于用户时,问而不是猜;
  - **架构优先 + 统筹**:以企业级资深工程师视角统筹整个任务;新项目/大功能
    先定架构再写代码;结构是硬要求——入口/根文件只做装配(如根 `App.vue`
    只放路由),地图、鉴权、API client 等共享能力走 `inject`/`provide` 或
    store,绝不因"功能能跑"牺牲结构;重大结构选择先说明理由;
  - **权限不变**:dsh 的沙箱/审批机制未动——以上是行为契约,不是强制;越权
    写的硬边界仍由 dsh 权限栈保证。
- `skills/codex-review/SKILL.md` —— 通过 `subagent_fork` 做独立评审的
  skill,避免父会话上下文左右结论。`skill-filesystem` 行用
  `createRequire(...).resolve(...)` 从已安装的 `codex-extras` 包解析该目录,
  因此走 profile 的模块解析,而不是硬编码路径。

## 目录结构

```
codex-extras/
  package.json                     # dsh.bundle.patch -> 本包成为 profile 补丁层
  review.js                        # /review 命令插件(纯 ESM,零依赖)
  fill.js                          # /fill 命令插件(纯 ESM,零依赖)
  persona.js                       # 按模型 persona 提供者(包子路径 ./persona)
  cordis.patch.yml                 # profile 行:注册 /review 与 /fill
  presets/codex-style.patch.yml    # 声明 codex-style agent 预设
  skills/codex-review/SKILL.md     # 预设携带的 review skill
```

## 安装

前置:带 base bundle 的 dsh profile(提供 `commands` 与 `subagents`),PATH 上有 `pnpm`。

```sh
# 一条命令安装 bundle、/review 与 /fill 行,以及 codex-style 预设声明
dsh plugin --profile <名字> add <本目录路径>
# 或在代码目录里执行:  dsh plugin --profile <名字> add .
```

重启 Host 使 bundle patch 生效,然后新建会话选预设(“Codex 风格”),或在
`agent-presets` 设置命名空间下把它设为 profile/用户默认。0.2.x 不再有
`~/.dsh/.agent-presets/` 复制步骤,预设就是 bundle 内的声明行。

## 升级 harness

这些都不在 harness 仓库里,升级 dsh 就是普通升级部署——无需合并、不会冲突。
仍有两处需要注意。profile 丢了依赖时,重跑一次 `dsh plugin` 命令;然后复查
预设声明:它的子行引用 harness 已安装的包及其配置键,某个版本可能把它们改名
或改结构,于是一行要么挂载失败,要么挂上了却什么都不做。检查方法见
[AGENTS.md](AGENTS.md)。

本 checkout 面向 dsh **0.2.x**。跨这个边界升级要小心:目录预设
(`$DSH_HOME/.agent-presets/`)已不再读取,`context.subagents.start()` 变成
`context.subagents.startActivation()`。本包已完成迁移;更早的 checkout
必须先迁移才能挂载。

## 迁移到另一台机器

这里全是普通文件加一条 profile 命令——没有任何机器相关路径。把本仓库当作
唯一真源:新机器上克隆它(或整目录复制 `codex-extras`),然后对着该
checkout 执行:

```sh
# 在新机器上:先装 dsh 并创建/选择一个 profile
git clone <codex-extras 仓库地址>     # 或把 codex-extras 目录整体复制过去
dsh plugin --profile <名字> add <checkout 目录>
```

重启 Host,然后在新建会话里选“Codex 风格”预设,试一下 `/review` 与
`/fill`。

### 交给 Agent 自安装

```text
请在这台机器上帮我自安装 codex-extras bundle。

背景:codex-extras 是 dsh 0.2.x 的 profile bundle。它的 patch 在 profile
根注册 /review 与 /fill,并声明 "codex-style" agent 预设(persona 提供者、
单编辑器、review skill)。不涉及 ~/.dsh/.agent-presets 目录。

请按顺序执行:
1. 先找到 codex-extras 的目录:如果我有给出 git 地址就克隆,否则问我本地路径。
2. 如果不知道用哪个 profile,先用 dsh --help 列出来;然后执行:
   dsh plugin --profile <profile名> add <codex-extras目录路径>
   如果 PATH 里没有 pnpm,停下来告诉我,不要绕开。
3. 写入或执行被沙箱拒绝时:只把被拒的那一步原样重试一次,带上最窄的
   sandbox_permissions 和一句 justification;除此之外不要用其它方式绕过。
4. 完成后汇报:bundle 装进了哪个 profile,以及仍需人工的部分(重启 Host、
   用 "Codex 风格" 新建会话、敲 /review 与 /fill 冒烟测试)。
   某一步失败就报告确切报错并停止,不要瞎猜。
```

## 卸载

```sh
dsh plugin --profile <名字> remove codex-extras
# 预设声明随 bundle 一起消失,没有其它目录需要删除
```

## 添加能力

有两个挂载面,规则决定选哪个:

- **profile bundle 行**(`cordis.patch.yml`):host 平面能力,对所有会话
  可用(如 `/review`、`/fill`);
- **预设行**(`presets/codex-style.patch.yml`):per-agent 能力。预设行只能
  引用安装在 profile 或 harness 里的包,不能引用相对预设目录的文件——声明
  继承的是声明方 Loader 的 base(profile 目录),不是某个预设目录。要随预设
  携带插件,就把它做成包子路径:`persona.js` 导出为 `codex-extras/persona`
  正是这个原因。

在 `"type": "module"` 的包内新增插件文件,导出为子路径,再从选中的行引用
该子路径。两个挂载面使用同一套函数插件契约:具名导出 `name` / `inject` /
`apply`,无 default export。0.2.x 已不再使用预设本地 CommonJS 文件那套规则。
