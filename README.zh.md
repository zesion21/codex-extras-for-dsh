# codex-extras

为 DeepSeek Harness 自建的 profile bundle:codex 风格能力,**全部在 harness 仓库之外**,上游更新永远不会与它冲突。当前提供人肉 `/review` 与 `/fill` 命令(profile bundle),并携带配套 `codex-style` agent 预设的源码(persona 提供者与 review skill 以文件形式放在预设目录内)。`tools` 的 `search` 披露模式被有意搁置:它需要改动 `dsh-tools` 注册表内部、没有插件扩展缝,不属于本包。

## 提供什么

### `/review` 命令(profile bundle)

人肉斜杠命令:派一个独立的 one-shot 子 agent(`ctx.subagents`,默认 provider `spawn`)评审工作区 diff 并返回发现。子 agent 在自己的上下文里运行,结论不会进入父会话的模型历史。它是纯 ESM 的 Cordis 函数插件(`review.js`),**零运行时依赖**,只消费 base bundle 提供的 `commands` 与 `subagents` 服务。行放在 `cordis.patch.yml`(profile 根),与 base bundle 注册 `/goal`、`/compact` 同层。

### `/fill` 命令(profile bundle)

人肉斜杠命令(`fill.js`):用真实的仓库事实填充项目模板文件里的占位符。适合“克隆模板再开发”的工作流:克隆后敲 `/fill`,独立子 agent 读取 `AGENTS.md`(或你指定的文件,`/fill <file>`),只替换它有把握从仓库推断出的占位符(git remote、package 名/描述、语言、license、日期),没把握的保留并列入 “Remaining”。敲 `/fill` 本身就是明确的修改授权;子 agent 仍遵守沙箱与审批规则,绝不编造值。

### `codex-style` agent 预设(预设目录)

`preset/codex-style/` 在完整 `standard` 工具面之上叠加 codex 形态的 persona、`str_replace_editor` 单编辑器与 `codex-review` skill。安装方式是把目录复制进 `~/.dsh/.agent-presets/codex-style`——不改仓库、不注册、与上游零冲突。

预设目录内有两个**预设本地文件**能力(由组合规则决定,不是偏好):

- `plugins/persona.js` —— persona 提供者。它是 `dsh-persona` 行加按模型 `variants` 的独立等价实现:从“解析出的模型 id(或 `*`)→ persona 文本”映射,精确 id 优先、其次 `*`、最后回退 `text`。预设行只能引用“预设自带的文件”或“harness 已安装的包”,且 persona 段是 scope-only(全局注册会与 prompt registry 冲突),所以提供者必须是预设目录内的文件。`variants` 在预设的 `agent.cordis.yml` 的 `persona` 行配置。预设自带 persona 携带完整工程师契约,`text` 为旗舰完整版,`deepseek-v4-flash` 使用精简务实版:
  - **先问再写**:只有用户明确要求改动才直接改;探索/讨论状态先检索(grep/glob)再给可选项,待用户确认后动手;
  - **不臆断**:请求含糊或决策属于用户时,问而不是猜;
  - **架构优先 + 统筹**:以企业级资深工程师视角统筹整个任务;新项目/大功能先定架构再写代码;结构是硬要求——入口/根文件只做装配(如根 `App.vue` 只放路由),地图、鉴权、API client 等共享能力走 `inject`/`provide` 或 store,绝不因“功能能跑”牺牲结构;重大结构选择先说明理由;
  - **权限不变**:dsh 的沙箱/审批机制未动——以上是行为契约,不是强制;越权写的硬边界仍由 dsh 权限栈保证。
- `skills/codex-review/SKILL.md` —— 通过 `subagent_fork` 做独立评审的 skill,避免父会话上下文左右结论。

## 目录结构

```
codex-extras/
  package.json            # 声明 dsh.bundle.patch -> 本包成为 profile 补丁层
  review.js               # /review 命令插件(纯 ESM,零依赖)
  fill.js                 # /fill 命令插件(纯 ESM,零依赖)
  cordis.patch.yml        # profile 行:在 profile 根注册 /review 与 /fill
  preset/codex-style/     # 本地 agent 预设的源(单独安装)
    agent.cordis.yml
    preset.yml
    plugins/persona.js    # 按模型 persona 提供者(文件行 ./plugins/persona.js)
    skills/codex-review/SKILL.md
```

## 安装

前置:带 base bundle 的 dsh profile(提供 `commands` 与 `subagents`),PATH 上有 `pnpm`。

```sh
# 1) bundle:/review 与 /fill 对该 profile 的所有会话可用
dsh plugin --profile <名字> add <本目录路径>
# 或在代码目录里执行:  dsh plugin --profile <名字> add .

# 2) 预设:安装配套 agent 预设
mkdir -p "$HOME/.dsh/.agent-presets/codex-style"   # Windows: %USERPROFILE%\.dsh\.agent-presets\codex-style
cp -R preset/codex-style/. <目标>
```

重启 Host 使 bundle patch 生效,然后新建会话选预设(“Codex 风格”),或在 `agent-presets` 设置命名空间下把它设为 profile/用户默认。

## 升级 harness

这些都不在 harness 仓库里,升级 dsh 就是普通升级部署。升级后只有当 profile 丢了依赖时才需要重跑一次 `dsh plugin` 命令;预设目录无需任何动作。

## 迁移到另一台机器

这里全是普通文件加一条 profile 命令——没有任何机器相关路径。迁移 = 装 dsh、复制预设目录、安装 bundle。把本仓库当作唯一真源:新机器上克隆它(或整目录复制 `codex-extras`),然后对着该 checkout 执行:

```sh
# 在新机器上:先装 dsh 并创建/选择一个 profile
git clone <codex-extras 仓库地址>     # 或把 codex-extras 目录整体复制过去
dsh plugin --profile <名字> add <checkout 目录>

# 预设:复制整个 preset/codex-style 目录(含 plugins/ 与 skills/)
#   Windows:   %USERPROFILE%\.dsh\.agent-presets\codex-style
#   macOS/Linux: $HOME/.dsh/.agent-presets/codex-style
#   (设置了 $DSH_HOME 时以其为准)
```

重启 Host,然后在新建会话里选“Codex 风格”预设,试一下 `/review` 与 `/fill`。

### 交给 Agent 自安装

```text
请在这台机器上帮我自安装 codex-style 预设和 codex-extras 插件。

背景:codex-extras 是一个 dsh profile bundle,它的仓库里同时带着 codex-style
预设源码(preset/codex-style/ 目录)。目标:预设出现在 preset 选择器
("Codex 风格"),且 profile 装上 bundle 后 /review 与 /fill 命令可用。

请按顺序执行:
1. 先找到 codex-extras 的目录:如果我有给出 git 地址就克隆,否则问我本地路径。
2. 如果不知道用哪个 profile,先用 dsh --help / dsh profile 列出来;然后执行:
   dsh plugin --profile <profile名> add <codex-extras目录路径>
   如果 PATH 里没有 pnpm,停下来告诉我,不要绕开。
3. 把 codex-extras 仓库里的 preset/codex-style/ 整个目录(agent.cordis.yml、
   preset.yml、plugins/、skills/ 全部)复制到 <dshHome>/.agent-presets/codex-style
   (dshHome = $env:DSH_HOME,未设置则是 %USERPROFILE%\.dsh)。若目标已存在,先备份再覆盖。
4. 写入或执行被沙箱拒绝时:只把被拒的那一步原样重试一次,带上最窄的
   sandbox_permissions 和一句 justification;除此之外不要用其它方式绕过。
5. 完成后汇报:bundle 装进了哪个 profile、预设的最终路径、以及仍需人工的部分
   (重启 Host、用 "Codex 风格" 新建会话、敲 /review 与 /fill 冒烟测试)。
   某一步失败就报告确切报错并停止,不要瞎猜。
```

## 卸载

```sh
dsh plugin --profile <名字> remove codex-extras
# 并删除预设目录 ~/.dsh/.agent-presets/codex-style
```

## 添加能力

有两个挂载面,规则决定选哪个:

- **profile bundle 行**(`cordis.patch.yml`):host 平面能力,对所有会话可用(如 `/review`、`/fill`);
- **预设行**:per-agent 能力。预设行只能引用预设自带的文件(`./plugins/…`)或 harness 已安装的包——不能是 profile 安装的 bundle——所以无法作为 harness 包的 per-agent 插件以文件形式放在预设目录内(如 `plugins/persona.js`)。

插件文件遵循函数插件契约(具名导出 `name` / `inject` / `apply`,无 default export),然后从所选的行引用它。
