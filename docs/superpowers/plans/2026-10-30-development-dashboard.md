# Development Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可部署到 GitHub Pages 的开发路线网页，读取指定 GitHub 文档目录，帮助个人开发者了解流程、阅读文档、获得下一步建议，并同步个人配置。

**Architecture:** 浏览器直接通过只读客户端访问目标仓库，以独立写入客户端保存个人配置；文档、图结构、分支状态和模型建议分别处理。先交付无 AI 也能完整使用的流程，再加入用户主动触发的在线 / 本地模型分析。

**Tech Stack:** TypeScript、React、Vite、npm、`@xyflow/react`、`react-markdown`、`remark-gfm`、Zod；Vitest、Testing Library 和 Playwright。状态使用 React reducer 与 context，不增加外部状态管理或数据库。

**Spec:** `docs/superpowers/specs/2026-10-30-development-dashboard-design.md`，2026-10-30 用户确认后的版本。

## Global Constraints

- “首版只支持 GitHub.com，不读取本地文件夹。”
- “只索引选定文档目录及其子目录中的 `.md` 文件。不扩展为整个代码仓库扫描。”
- “手动标记始终优先。”
- “用户主动触发分析。”文档刷新、复制 prompt 和页面加载不调用模型。
- “流程结构按项目共享，手动状态和 AI 判断按分支保存。”
- “点击‘保存到 GitHub’才同步”，目标仓库只读，配置写入用户独立配置仓库。
- “页面可见且已授权时，默认每 60 秒检查；未授权公开浏览时默认每 5 分钟检查。”
- “令牌和模型密钥默认只驻留当前页面内存。”
- “不自动拼入仓库地址、文档正文、状态、用户身份或密钥。”此约束专指复制的通用 prompt；模型分析另有显式发送范围。
- 页面采用草图 A 的逻辑：完整画布为主，所选环节详情在下方；新手模式首次默认开启。
- 产品说明、界面提示、代码注释和提交说明默认中文；代码标识保持英文。
- 首版不实现多项目总览、功能拆解、任务执行、文档生成或 OAuth 后端。
- 本计划只生成源码、检查和部署配置；不把推送、发布或真实模型费用视为已经获得授权。

## Review Focus

1. **分支名含 `/`、中文、`#` 或类似对象原型的键**：使用 GitHub 返回的分支名和显式 `ref`，状态记录不能串支或造成对象属性污染。对应 Task 2、7。
2. **空仓库、目录不存在与私有仓库未授权都可能缺少内容**：区分错误来源，保留路线，不把权限错误渲染为一串“文档缺失”。对应 Task 2、3、4。
3. **迟到的请求与用户新操作交错**：旧仓库 / 旧分支请求或模型响应不得覆盖新选择或手动状态。对应 Task 7、11。
4. **两台设备保存及网络超时后结果不确定**：保留草稿、检查远端，不覆盖他人较新配置或重复提交。对应 Task 8。
5. **Markdown、链接、模型 JSON 含恶意内容或凭据诱导**：安全渲染、校验引用、限制请求目的地，不泄露授权头。对应 Task 2、4、10、12。

---

## 当前状态与执行边界

当前工作目录 `/Users/zhichaoling/development/Development dashboard` 只有设计与计划文档，没有工程、依赖或 Git 仓库。计划中下列源文件均是待创建文件，测试和构建命令尚未运行。

执行时先检查 `AGENTS.md`、已有文件及 Node/npm 环境，沿用届时已存在的用户工程设置。没有现有工程时采用本计划的默认技术栈；不在规划阶段安装依赖或初始化工程。Node 采用兼容安装版本 Vite 的受支持版本，基线为 Node 22.12+；实际依赖在首次安装时固定到 `package-lock.json`，CI 使用相同 Node 主版本和 `npm ci`。

本计划的任务构成同一个应用，不是多个独立产品。它们分阶段验收，但全部属于首版范围；“先不用 AI”是开发顺序，不是删除 AI 需求。

执行进入 Task 1 时，若目录仍不是 Git 仓库，可以初始化本地 Git 以记录本项目；已有仓库则沿用。每个 Task 完成后检查差异，只提交该 Task 实际创建或修改的文件，消息使用下列中文说明，不运行 `git add .`，不自动设置远端或推送。若无法可靠确认改动归属，保留改动并报告，不提交混合内容。

## 文件结构与职责

```text
src/
  main.tsx, app/App.tsx, app/app.css       页面入口和布局
  app/projectReducer.ts, app/useProject.ts  单项目会话及异步结果归属
  domain/project.ts, domain/analysis.ts    配置、图、状态、分析的数据契约
  domain/schema.ts                        持久化边界校验
  templates/catalog.ts                    三种范式、指导和静态 prompt
  workflow/graph.ts, workflow/backup.ts    图编辑、撤销、切换与恢复
  workflow/status.ts, workflow/recommend.ts 状态派生和基本推荐
  github/credentials.ts, github/client.ts  内存凭据与受限请求
  github/repository.ts                    仓库、分支及 commit 解析
  github/refresh.ts                       缓存、检查间隔、限流调度
  documents/index.ts, documents/match.ts   指定目录索引与文档关联
  components/ConnectProject.tsx            仓库输入、分支和目录选择
  components/WorkflowCanvas.tsx, StageNode.tsx  图和状态提示
  components/StageDetails.tsx, MarkdownReader.tsx 文档与环节指导
  components/WorkflowEditor.tsx, TemplatePicker.tsx 图编辑与范式预览
  components/SyncPanel.tsx, ModelPanel.tsx  同步和模型设置
  config/repository.ts, config/session.ts  配置读写、草稿和冲突
  ai/input.ts, ai/result.ts                分析输入、指纹和证据校验
  ai/adapters.ts, ai/openaiCompatible.ts, ai/ollama.ts  请求协议
  ai/controller.ts                        用户触发、取消、结果提交
tests/
  fixtures.ts                             合成数据构造函数，无真实凭据
  domain/, github/, documents/, workflow/, config/, ai/ 单元测试
  components/                             用户交互测试
  e2e/                                    浏览器流程测试，拦截外部 API
docs/verification.md                       实际执行的兼容性记录
.github/workflows/checks.yml, pages.yml    检查及待用户启动的 Pages 发布
```

文件按职责组织，不提前创建空目录、空类或通用框架。测试数据仅模拟一个项目的几个文档。CSS 用普通样式和变量，不增加 UI 框架。

## 共享数据契约

在 Task 1 中定义，后续任务统一导入，不能另造同名异形对象：

```ts
type ManualStatus = 'not-started' | 'in-progress' | 'done' | 'deferred';
type DocumentChoice = 'needed' | 'not-needed' | 'later';
type Repository = { id: number; owner: string; name: string; defaultBranch: string | null };
type BranchRef = { name: string; commitSha: string };
type DocumentFile = { path: string; blobSha: string; content: string; size: number };
type ExpectedDocument = { id: string; nodeId: string; fileName: string };
type StageGuidance = { why: string; action: string; checks: string[] };
type WorkflowNode = {
  id: string; title: string; order: number; position: { x: number; y: number };
  guidance: StageGuidance; promptIds: string[];
};
type WorkflowGraph = { nodes: WorkflowNode[]; edges: { id: string; source: string; target: string }[] };
type DocumentRules = { root: string; expected: ExpectedDocument[]; bindings: Record<string, string> };
type TemplateSnapshot = {
  id: string; version: number; title: string; description: string;
  graph: WorkflowGraph; documentRules: DocumentRules; prompts: Record<string, string>;
};
type EvidenceRef = { path: string; startLine: number; endLine: number };
type AnalysisRecord = {
  nodeId: string; branch: string; commitSha: string; createdAt: string;
  model: string; adapter: 'openai-compatible' | 'ollama';
  decision: ManualStatus | 'insufficient'; summary: string; evidence: EvidenceRef[];
  inputs: { path: string; blobSha: string }[]; inputFingerprint: string;
  nextAction: string | null; adviceBasisFingerprint: string;
};
type BranchState = {
  manualStatuses: Record<string, ManualStatus>;
  documentChoices: Record<string, DocumentChoice>;
  analyses: Record<string, AnalysisRecord>;
};
type WorkflowBackup = {
  id: string; createdAt: string; template: TemplateSnapshot | null;
  graph: WorkflowGraph; documentRules: DocumentRules; branches: Record<string, BranchState>;
};
type ProjectConfig = {
  schemaVersion: 1; repository: Repository; template: TemplateSnapshot | null;
  graph: WorkflowGraph; documentRules: DocumentRules;
  branches: Record<string, BranchState>; backups: WorkflowBackup[];
};
type ReadIssue = { path: string; kind: 'missing' | 'too-large' | 'incomplete'; message: string };
type DocumentSnapshot = {
  repository: Repository; ref: BranchRef | null; root: string;
  documents: DocumentFile[]; issues: ReadIssue[]; fetchedAt: string;
};
type NodeView = {
  status: ManualStatus | 'unknown'; source: 'manual' | 'ai' | 'none';
  analysis: 'fresh' | 'stale' | 'absent' | 'disabled';
};
type Recommendation = {
  nodeId: string | null; documentId?: string;
  action: 'create-document' | 'review-stage' | 'add-stage' | 'all-done';
  source: 'manual' | 'template' | 'ai'; reason: string;
};
```

这些类型只包含可持久化数据，没有令牌、模型 key、原文档正文或浏览器运行时对象。`DocumentSnapshot` 不属于 `ProjectConfig`。Record 的反序列化和访问使用自有属性检查或安全字典，不能通过继承属性识别分支。

首版可由构建者确定的边界在此固定：单 Markdown 文件最多 200 KiB，单次目录总正文最多 2 MiB / 200 文件，配置文件最多 2 MiB，备用快照最多 10 份。超出后明确提示缩小范围或手动清理，不静默截断、删备份或声称已完整读取。目录项达到 Contents API 单目录上限时标记不完整并要求缩小目录，不扫描仓库其他部分。

## 阶段与依赖

| 阶段 | 任务 | 可验收结果 |
| --- | --- | --- |
| 一 | 1–4 | 输入仓库后能看见路线、文档、缺失提示与通用 prompt |
| 二 | 5–9 | 调整流程、手动状态、分支隔离、刷新及 GitHub 配置同步可用 |
| 三 | 10–11 | 用户主动进行内容分析，在线 / 本地模型可选，手动状态优先 |
| 四 | 12 | 浏览器验收、静态部署准备及实际兼容性记录 |

顺序执行：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12。任务接口相互依赖，不为并行而拆出多个工程。

## Task 1：建立数据契约、范式与可运行的最小页面

**Files:** 创建 `package.json`、`package-lock.json`、`index.html`、Vite / TypeScript / Vitest 配置、`.gitignore`；创建 `src/main.tsx`、`src/app/App.tsx`、`src/app/app.css`、`src/domain/{project,analysis,schema}.ts`、`src/templates/catalog.ts`、`tests/fixtures.ts`、`tests/domain/project.test.ts`。

**Interfaces:**
- Consumes: 设计文档及上面的共享契约。
- Produces: `createProject(repository: Repository, template: TemplateSnapshot | null): ProjectConfig`、`getBranchState(config: ProjectConfig, branch: string): BranchState`、`parseProjectConfig(input: unknown): { kind: 'supported'; config: ProjectConfig } | { kind: 'unsupported-version'; version: number }`、`templates: readonly TemplateSnapshot[]`。
- Fixtures: `makeConfig(overrides?: Partial<ProjectConfig>): ProjectConfig`、`makeSnapshot(overrides?: Partial<DocumentSnapshot>): DocumentSnapshot`、`makeAnalysis(overrides?: Partial<AnalysisRecord>): AnalysisRecord`，默认节点 `requirements`、分支 `main`、预期文档 ID `requirements-doc`、路径 `docs/development/02-requirements.md`。

- [ ] **Step 1:** 在保留 `docs/` 的前提下初始化 React + TypeScript 工程和测试入口；不要对非空目录强制覆盖。增加 scripts：`dev`、`test`（`vitest run`）、`typecheck`、`build`、`preview`、`test:e2e`。设置 `.gitignore` 排除依赖、产物、测试输出、`.env*`、本机技能会话目录和缓存。
- [ ] **Step 2:** 编写领域测试，至少包含以下断言；先不实现相关函数。

```ts
const config = createProject(makeSnapshot().repository, templates[0]);
expect(getBranchState(config, 'main').manualStatuses).toEqual({});
expect(config.template?.id).toBe('general-app');
expect(config.documentRules.root).toBe('docs/development');
expect(templates[0].graph.nodes.map(n => n.title))
  .toEqual(['想法与目标', '需求', '设计', '开发', '测试', '交付']);
expect(parseProjectConfig({ schemaVersion: 99 }))
  .toEqual({ kind: 'unsupported-version', version: 99 });
```

- [ ] **Step 3:** 运行 `npm test -- tests/domain/project.test.ts`，确认测试因未实现领域行为而失败，而非测试环境配置错误。
- [ ] **Step 4:** 实现上述接口及 Zod 校验；范式采用副本，避免编辑共享模板；提供通用应用、MVP 和迭代三套完整指导及静态 prompt。空白路线 `template: null`，包含空图和可调整的文档目录。
- [ ] **Step 5:** 同一测试通过后运行 `npm run typecheck` 和 `npm run build`；页面能打开，显示仓库连接入口。检查差异后本地提交 `feat: 建立项目模型与开发范式基础`。

## Task 2：实现安全的 GitHub 只读连接

**Files:** 创建 `src/github/{credentials,client,repository}.ts`、`tests/github/repository.test.ts`、`tests/github/credentials.test.ts`。

**Interfaces:**
- Consumes: `Repository`、`BranchRef`。
- Produces: `CredentialSlot = 'target' | 'config' | 'model'`；`MemoryCredentials` 的 `set(slot: CredentialSlot, value: string | undefined): void`、`get(slot: CredentialSlot): string | undefined`、`clear(): void`；`RepositoryInput = { owner: string; name: string }` 和 `parseRepositoryInput(input: string): RepositoryInput`。
- Produces: `GitHubReader` 构造参数 `{ fetcher: typeof fetch; credentials: MemoryCredentials; credentialSlot: 'target' | 'config' }`，通过固定 slot 选择凭据。
- Produces: `GitHubReader` 的 `getRepository(input: RepositoryInput, signal?: AbortSignal): Promise<Repository>`、`listBranches(repo: Repository, signal?: AbortSignal): Promise<string[]>`、`resolveRef(repo: Repository, branch: string, signal?: AbortSignal): Promise<BranchRef | null>`、`listDirectory(repo: Repository, path: string, commitSha: string, signal?: AbortSignal): Promise<GitHubEntry[]>`、`readFile(repo: Repository, path: string, commitSha: string, signal?: AbortSignal): Promise<DocumentFile>`；`GitHubEntry = { path: string; type: 'file' | 'dir' | 'symlink' | 'submodule'; sha: string; size: number }`。
- `GitHubError` 的 `kind` 明确区分 `unauthorized`、`forbidden`、`not-found-or-no-access`、`rate-limited`、`network` 和 `empty-repository`，不包含秘密或原始请求头。

- [ ] **Step 1:** 编写 fake fetch 测试，覆盖公开读取、携带 target 令牌、分支分页及 `feature/登录#2` 的参数编码；断言所有目标仓库请求方法为 `GET`，凭据只发往 `https://api.github.com`。

```ts
expect(parseRepositoryInput('https://github.com/acme/demo.git'))
  .toEqual({ owner: 'acme', name: 'demo' });
expect(() => parseRepositoryInput('https://github.com.evil.test/acme/demo')).toThrow();
expect(() => parseRepositoryInput('https://github.com/acme/demo/tree/main')).toThrow();
// mock 分支提交为 c1：读取目录 / 文件必须沿用 c1，而非再次使用可变 main。
expect(contentRequestUrl.searchParams.get('ref')).toBe('c1');
expect(requests.every(r => r.method === 'GET')).toBe(true);
```

- [ ] **Step 2:** 运行 `npm test -- tests/github/repository.test.ts tests/github/credentials.test.ts`，确认缺少实现导致失败。
- [ ] **Step 3:** 实现接口；输入只接受仓库根 URL 或 `owner/name`，分支使用列表单独选择。使用 GitHub 返回分页链接；限流返回可重试时间；空仓库独立处理。拒绝未知主机、嵌入式凭据和含 token 的输入，不将令牌持久化到浏览器存储。
- [ ] **Step 4:** 补测 `401/403/404/409/429` 和非 JSON 错误响应：私有仓库 `404` 不能简单归为文档缺失；空仓库的分支解析可返回 `null`；仅已成功连接仓库内部的目录 `404` 交由文档层分类。全部测试通过。
- [ ] **Step 5:** `npm run typecheck` 通过后，检查差异并本地提交 `feat: 支持只读连接 GitHub 仓库与分支`。

## Task 3：限定目录读取、命名识别与文档检查

**Files:** 创建 `src/documents/{index,match}.ts`、`tests/documents/index.test.ts`、`tests/documents/match.test.ts`。

**Interfaces:**
- Consumes: `GitHubReader`、`DocumentRules`、`ProjectConfig`、`DocumentSnapshot`。
- Produces: `loadDocumentSnapshot(reader: GitHubReader, repo: Repository, branch: string, root: string, signal?: AbortSignal): Promise<DocumentSnapshot>`。
- Produces: `indexDocuments(config: ProjectConfig, snapshot: DocumentSnapshot): DocumentIndex`；`DocumentIndex = { matches: DocumentMatch[]; others: DocumentFile[] }`，`DocumentMatch = { documentId: string; nodeId: string; kind: 'found' | 'missing' | 'unavailable' | 'ambiguous'; paths: string[]; contentCheck: 'empty' | 'heading-only' | 'not-checked' }`。

- [ ] **Step 1:** 测试指定目录外的 `README.md`、代码和符号链接不会被读取；手动绑定优先；同名候选不猜选；目录缺失可返回缺失提示；私有仓库权限错误继续抛出。

```ts
const config = makeConfig();
const snapshot = makeSnapshot({ documents: [{
  path: 'docs/development/02-requirements.md', blobSha: 'b1', content: '# 需求', size: 8,
}] });
expect(indexDocuments(config, snapshot).matches[0])
  .toMatchObject({ kind: 'found', contentCheck: 'heading-only' });
// found 只描述文档匹配；本函数不返回或写入任何 done 状态。
expect(getBranchState(config, 'main').manualStatuses).toEqual({});
```

- [ ] **Step 2:** `npm test -- tests/documents` 应因缺少实现失败。
- [ ] **Step 3:** 实现目录内递归、路径归一化和边界检查；中文、空格、大小写按仓库实际路径处理；仅 `.md` 文件参与匹配。相对文件名以 root 为基准，绝不允许通过 `../` 逃出 root。读取中遇到目录 404，须重新确认仓库仍可访问，再提示目录缺失；限流或权限中断不生成“已完整扫描”的部分结果。
- [ ] **Step 4:** 加入大文件、200 文件 / 2 MiB 总量、目录项上限及中途取消测试；超限返回 `ReadIssue`，存在 `incomplete` 时不能把未读取文件判定为确定缺失。执行 `npm test -- tests/documents` 和 `npm run typecheck`，均通过。
- [ ] **Step 5:** 检查差异后本地提交 `feat: 按文档规范识别指定目录内容`。

## Task 4：交付 A 布局的只读使用流程

**Files:** 创建 `src/components/{ConnectProject,WorkflowCanvas,StageNode,StageDetails,MarkdownReader}.tsx`；修改 `src/app/App.tsx`、`src/app/app.css`；创建 `tests/components/reader.test.tsx`、`tests/components/onboarding.test.tsx`。

**Interfaces:**
- Consumes: 前面数据契约、`GitHubReader`、`loadDocumentSnapshot`、`indexDocuments`。
- Produces: `WorkflowCanvas({ graph, nodeViews, selectedNodeId, onSelectNode, onGraphChange? })`；`StageDetails({ config, snapshot, nodeId, documentIndex, beginnerMode })`，TS props 在对应组件导出。
- Produces: `MarkdownReader({ content: string, documentPath: string, snapshot: DocumentSnapshot })`，只读，普通文字、代码块和 GFM 表格 / 复选框均可阅读。

- [ ] **Step 1:** 组件测试模拟仓库返回：连接后可看见完整路线、当前分支、文档缺失提示；点需求节点后详情在画布下方。新手模式默认开启，关闭后保留文档 / 状态 / prompt。
- [ ] **Step 2:** `npm test -- tests/components/onboarding.test.tsx tests/components/reader.test.tsx` 应失败，缺少所需界面与安全行为。
- [ ] **Step 3:** 用 React Flow 实现画布展示，使用 `react-markdown` + `remark-gfm` 安全阅读，保留默认安全 URL 转换，不启用原始 HTML。相对链接解析到当前分支的 GitHub 原文件；跨目录只提供外部打开。首版图片显示受控占位及“在 GitHub 查看”入口，不加载第三方远程图片。
- [ ] **Step 4:** 增加 `<script>`、`javascript:` 链接、HTML 事件属性测试；断言无执行节点。mock Clipboard 后复制指定 prompt，严格等于 `config.template.prompts[promptId]`，不含项目正文或地址；复制失败显示可手动选择的原文本。空仓库与未授权视图可区分。运行对应组件测试及构建，通过。
- [ ] **Step 5:** 本地打开模拟项目检查画布主次、中文阅读及键盘焦点，记录实际结果；提交 `feat: 展示开发路线与只读文档详情`。

## Task 5：可编辑流程、范式切换和恢复

**Files:** 创建 `src/workflow/{graph,backup}.ts`、`src/components/{WorkflowEditor,TemplatePicker}.tsx`、`tests/workflow/graph.test.ts`、`tests/workflow/backup.test.ts`；修改 `WorkflowCanvas.tsx`、`App.tsx`。

**Interfaces:**
- Consumes: `ProjectConfig`、`WorkflowGraph`、`WorkflowNode`、`TemplateSnapshot`。
- Produces: `applyGraphCommand(config: ProjectConfig, command: GraphCommand): ProjectConfig`。`GraphCommand` 为 `add-node(node)`、`rename-node(id,title)`、`move-node(id,position)`、`remove-node(id)`、`add-edge(edge)`、`remove-edge(id)` 的判别联合，参数类型来自共享契约。
- Produces: `switchTemplate(config: ProjectConfig, template: TemplateSnapshot, now: Date): ProjectConfig`、`restoreBackup(config: ProjectConfig, backupId: string): ProjectConfig`。达到 10 份备份时抛出 `BackupLimitError`，由 UI 让用户明确删除某一份或取消，不自动清除。

- [ ] **Step 1:** 测试增减 / 改名 / 移动节点、并行分支、回路；删除节点会移除悬空边，保留可恢复快照；单纯移动坐标不改变手动状态或 AI 输入有效性。
- [ ] **Step 2:** `npm test -- tests/workflow/graph.test.ts tests/workflow/backup.test.ts` 应失败。
- [ ] **Step 3:** 实现纯图命令和备用快照；删除节点与切换范式前显示预览，撤销保存本会话最近 20 次编辑。恢复前保存当前图和状态，防止恢复操作丢失后来的工作；相关 UI 也提供按钮而非只有拖拽。
- [ ] **Step 4:** 断言切换后旧模板不会变、旧节点状态不会错误套用到新节点、恢复图和对应分支状态一致；空白画布可添加带说明的节点并手动关联文档，无 prompt 时明确显示。运行本 Task 测试及 `npm run typecheck`，通过。
- [ ] **Step 5:** 检查差异后本地提交 `feat: 支持自定义开发流程与范式恢复`。

## Task 6：手动状态、文档取舍和基本下一步建议

**Files:** 创建 `src/workflow/{status,recommend}.ts`、`tests/workflow/status.test.ts`、`tests/workflow/recommend.test.ts`；修改 `StageDetails.tsx`、`StageNode.tsx`。

**Interfaces:**
- Consumes: `ProjectConfig`、`DocumentSnapshot`、`DocumentIndex`、`NodeView`、`AnalysisRecord`。
- Produces: `analysisInputKey(config: ProjectConfig, snapshot: DocumentSnapshot, nodeId: string): string` 和 `adviceBasisKey(config: ProjectConfig, branch: string): string`，对已声明输入做稳定排序及序列化，键不包含原文或秘密。
- Produces: `deriveNodeView(config: ProjectConfig, snapshot: DocumentSnapshot, nodeId: string, aiEnabled: boolean): NodeView`、`recommendNext(config: ProjectConfig, snapshot: DocumentSnapshot, index: DocumentIndex, aiEnabled: boolean): Recommendation`。
- Produces: `setManualStatus(config, branch: string, nodeId: string, status: ManualStatus | null): ProjectConfig`、`setDocumentChoice(config, branch: string, documentId: string, choice: DocumentChoice): ProjectConfig`。

- [ ] **Step 1:** 为手动优先、清除手动值、文档缺失 / 空模板不等于完成、分支间互不影响、AI 过期与关闭、跳过文档写断言。测试内定义 `withValidAnalysis(config, analysis)`，用当前输入键写入合成分析；`laterDocConfig` / `laterDocIndex` 是同一文档被标为 later 后的配置和索引：

```ts
const cfg = setManualStatus(makeConfig(), 'main', 'requirements', 'done');
// makeAnalysis 对当前输入有效，decision 为 in-progress。
expect(deriveNodeView(withValidAnalysis(cfg, makeAnalysis()), makeSnapshot(), 'requirements', true))
  .toMatchObject({ status: 'done', source: 'manual' });
expect(deriveNodeView(makeConfig(), makeSnapshot(), 'requirements', false))
  .toMatchObject({ status: 'unknown', source: 'none' });
expect(recommendNext(laterDocConfig, makeSnapshot(), laterDocIndex, false).documentId)
  .not.toBe('requirements-doc');
```

- [ ] **Step 2:** `npm test -- tests/workflow/status.test.ts tests/workflow/recommend.test.ts` 应失败。
- [ ] **Step 3:** 实现接口；新分支无状态、不自动继承。输入键包含节点说明、相关路径 / blob SHA、关联、范式版本及 `analysisRuleVersion: 1`，不包含画布坐标或无关代码 HEAD。建议依据键另包含手动状态、文档取舍、边和顺序，防止复用旧 AI 排序。
- [ ] **Step 4:** 推荐算法采用“手动进行中优先 → 前置没有明确未完成项的候选 → 图上顺序稳定排序”；全是回路或都被前置阻塞时仍返回有理由的可选环节，不阻止用户跳步。全已完成 / 暂缓时返回 `all-done`，文案说明当前无建议推进项，不能声称代码已完成。补测回路、并行、同序号按 ID 稳定排序、“不需要 / 稍后”不持续催促。对应测试及类型检查通过。
- [ ] **Step 5:** 接入状态按钮、文档取舍按钮和建议条后，提交 `feat: 根据手动状态和范式提供下一步建议`。

## Task 7：单项目会话与分支切换的异步正确性

**Files:** 创建 `src/app/{projectReducer,useProject}.ts`、`tests/domain/project-session.test.ts`；修改 `App.tsx`、`ConnectProject.tsx`。

**Interfaces:**
- Consumes: `GitHubReader`、`loadDocumentSnapshot`、领域操作和推荐接口。
- Produces: `ProjectSession = { config: ProjectConfig | null; snapshot: DocumentSnapshot | null; selectedBranch: string | null; selectedNodeId: string | null; generation: number; busy: boolean; dirty: boolean; error: string | null }`。
- Produces: `projectReducer(state: ProjectSession, action: ProjectAction): ProjectSession`；异步完成 action 必须包含 `generation, repositoryId, branch`。`useProject(reader: GitHubReader)` 返回 `{ state, connect(input: string): Promise<void>, selectBranch(branch: string): Promise<void>, refresh(): Promise<void>, applyConfig(config: ProjectConfig): void }`，凭据不进 reducer。

- [ ] **Step 1:** 用延迟 Promise 测试 main → feature → main 的交错返回、连两个仓库、切分支时编辑状态、新分支无历史状态，以及 `__proto__` 分支只按自有键访问。
- [ ] **Step 2:** `npm test -- tests/domain/project-session.test.ts` 应失败。
- [ ] **Step 3:** 实现 generation 校验和 AbortController；成功结果归属于请求时的仓库和分支。保留项目共享图、当前各分支独立状态和草稿；有未同步修改时切仓库提示保存 / 留在当前页 / 放弃，不默默丢弃。
- [ ] **Step 4:** 断言旧响应即使未被 abort 也不能覆盖当前选择；分支被删后保留状态并报错，不自动退回 main；空仓库仍允许流程配置和 prompt 使用。运行本 Task 测试和组件测试，均通过。
- [ ] **Step 5:** 检查差异后本地提交 `fix: 隔离分支状态并防止旧请求覆盖当前项目`。

## Task 8：独立配置仓库同步与并发冲突处理

**Files:** 创建 `src/config/{repository,session}.ts`、`src/components/SyncPanel.tsx`、`tests/config/repository.test.ts`、`tests/config/session.test.ts`；修改 `App.tsx`。

**Interfaces:**
- Consumes: `ProjectConfig`、`parseProjectConfig`、配置凭据，以及使用 config 凭据实例化的只读 `GitHubReader`。
- Produces: `ConfigRepository = { repository: Repository; branch: string | null }`；`LoadedConfiguration = { config: ProjectConfig | null; fileSha: string | null; unsupportedVersion: number | null }`。
- Produces: `loadConfiguration(source: ConfigRepository, targetRepositoryId: number, signal?: AbortSignal): Promise<LoadedConfiguration>`；`saveConfiguration(source: ConfigRepository, config: ProjectConfig, expectedSha: string | null, signal?: AbortSignal): Promise<SaveResult>`。
- `SaveResult = { kind: 'saved'; fileSha: string } | { kind: 'conflict' } | { kind: 'uncertain' }`；网络、权限、格式错误走不含秘密的异常。配置写入网关绑定唯一的 source 仓库 ID，只允许 `projects/<id>.json`，拒绝 source 与 target ID 相同。
- `ConfigSession` 区分 `clean | dirty | saving | saved | error | conflict | uncertain`；接入 `useProject.applyConfig`，保存成功后才清除 dirty。

- [ ] **Step 1:** 测试新配置、带 expectedSha 更新、跨设备加载、409 / 422 冲突、版本过新只读、权限失败保留草稿、同目标仓库拒绝写入。

```ts
expect(putRequest.url).toContain('/config-store/contents/projects/123.json');
expect(JSON.parse(putRequest.body).sha).toBe('previous-sha');
expect(JSON.parse(putRequest.body).message).toBe('chore: 更新开发路线配置');
expect(putRequest.headers.Authorization).toBe('Bearer synthetic-config-token');
expect(JSON.stringify(serializedConfig)).not.toContain('synthetic-config-token');
expect(await saveConfiguration(source, config, 'outdated-sha'))
  .toEqual({ kind: 'conflict' });
```

- [ ] **Step 2:** `npm test -- tests/config` 应失败。
- [ ] **Step 3:** 实现 UTF-8 / Base64 读写、SHA 乐观并发、配置序列化白名单和显式保存；不自动创建仓库。空配置仓库首次保存可创建默认分支，成功后更新 source.branch；首次文件不存在仅在仓库已成功认证后视为新配置。限制配置体 2 MiB，顺序写入。
- [ ] **Step 4:** 模拟 PUT 超时但实际上成功：重新 GET 并核对内容，相同则确认 saved；不同则返回 uncertain / conflict 并保留草稿。断言不会直接再发一个 PUT。构造两个会话读同 SHA，后保存者检测冲突。原文、凭据均不在配置里；写入请求从未发给目标仓库。测试和类型检查通过。
- [ ] **Step 5:** 接入同步面板、清晰 dirty / failure 提示、离开前提示；对公开配置仓库告知配置可能含私有项目摘要，允许取消。提交 `feat: 将个人流程配置同步到独立 GitHub 仓库`。

## Task 9：按需刷新、缓存及限流

**Files:** 创建 `src/github/refresh.ts`、`tests/github/refresh.test.ts`；修改 `client.ts`、`useProject.ts`。

**Interfaces:**
- Consumes: 只读 GitHub 客户端与会话 refresh。
- Produces: `RefreshScheduler` 的 `update({ visible: boolean, authenticated: boolean }): void`、`focus(): void`、`refreshNow(): Promise<void>`、`stop(): void`；构造时注入 `now: () => number` 和 `refresh: () => Promise<void>`。
- 缓存键包含 repository ID、分支、commit SHA、目录和凭据会话代次；凭据变化和断开连接时清理。请求队列在 `GitHubReader` 底层串行处理；合法 304 复用当前会话已缓存结果。

- [ ] **Step 1:** 用 fake timer 测试已授权 60 秒、未授权 300 秒、隐藏暂停、焦点不足间隔不刷新、手动刷新去重，以及停止后零请求。
- [ ] **Step 2:** `npm test -- tests/github/refresh.test.ts` 应失败。
- [ ] **Step 3:** 实现定时调度、ETag 条件请求、串行请求和限流退避。使用 `Retry-After` 或 `X-RateLimit-Reset`，配置冲突 / 401 / 持续 404 不进入无穷重试。只在新 commit 下文档实际变化时替换相关正文。
- [ ] **Step 4:** 补测撤销凭据后不显示私有缓存、无相关文档变化的代码提交不使分析失效、已变 blob 使分析过期但保留手动值；刷新过程中断言模型请求次数始终为 0。运行 refresh 和 session 测试，通过。
- [ ] **Step 5:** 展示上次检查时间、版本和暂停原因后，提交 `feat: 刷新 GitHub 文档并控制请求频率`。

## Task 10：模型输入、适配器和证据校验

**Files:** 创建 `src/ai/{input,result,adapters,openaiCompatible,ollama}.ts`、`tests/ai/input.test.ts`、`tests/ai/adapters.test.ts`、`tests/ai/result.test.ts`。

**Interfaces:**
- Consumes: `ProjectConfig`、`DocumentSnapshot`、`AnalysisRecord`、`analysisInputKey` 和 `adviceBasisKey`。
- Produces: `ModelSettings = { adapter: 'openai-compatible' | 'ollama'; endpoint: string; model: string; maxInputChars: number }`。默认预算 `12000` 个 JS 字符，仅作为明确的粗上限，不声称等同模型 token 数。
- `AnalysisInput = { nodeId: string; branch: string; commitSha: string; inputFingerprint: string; adviceBasisFingerprint: string; guidance: StageGuidance; manualStatus: ManualStatus | null; documentChoices: Record<string, DocumentChoice>; documents: { path: string; blobSha: string; lines: string[] }[] }`。
- Produces: `buildAnalysisInput(config: ProjectConfig, snapshot: DocumentSnapshot, nodeId: string, maxInputChars: number): AnalysisInput`，超预算抛出带所需 / 允许字符数的 `InputBudgetError`。
- Produces: `ModelAdapter.analyze(input: AnalysisInput, settings: ModelSettings, modelKey: string | undefined, signal?: AbortSignal): Promise<unknown>`；`validateAnalysis(raw: unknown, input: AnalysisInput, settings: ModelSettings, now: Date): AnalysisRecord`。

- [ ] **Step 1:** 测试只包含选定环节且已关联的文档、稳定行号、无 GitHub / 模型密钥、超预算拒绝、空文档信息不足、恶意指令作为待分析正文处理。测试合法 / 越界 / 非输入文档证据，幻觉节点 ID、无证据却声称完成均降级或拒绝。
- [ ] **Step 2:** `npm test -- tests/ai` 应失败。
- [ ] **Step 3:** 实现输入构建及结构校验。非 `insufficient` 状态必须有可核对证据；固定保存 model、adapter、createdAt 和输入版本。模型不得决定保存位置、发起工具请求或修改图；nextAction 只针对本次节点，建议排序仍由现有规则控制。
- [ ] **Step 4:** 实现非流式 OpenAI-compatible chat completions 与 Ollama `/api/chat` 两个适配器，在线 endpoint 填完整 HTTPS URL，本地仅允许用户显式配置的 loopback HTTP(S) URL，不扫描本机端口。请求无 tools；默认无自动重试。对 401 / 429 / 格式错误 / abort / 跨域失败保留原分析；只发 modelKey，不接收 GitHub 凭据。用 fake fetch 证明请求和 JSON 解包正确，再执行类型检查。
- [ ] **Step 5:** 本地提交 `feat: 接入可追溯的在线与本地文档分析`。此时只证明协议逻辑，不把模拟通过写成真实服务兼容。

## Task 11：用户主动分析与状态集成

**Files:** 创建 `src/ai/controller.ts`、`src/components/ModelPanel.tsx`、`tests/ai/controller.test.ts`、`tests/components/analysis.test.tsx`；修改 `StageDetails.tsx`、`useProject.ts`、`App.tsx`。

**Interfaces:**
- Consumes: 分支会话、`buildAnalysisInput`、`ModelAdapter`、`validateAnalysis`、内存 model 凭据。
- Produces: `AnalysisController` 的 `analyzeNode(nodeId: string): Promise<void>`、`analyzeWorkflow(): Promise<void>`、`cancel(): void`；构造时注入读取当前会话和提交到指定 branch 的回调。
- `ModelPanel` 提供关闭 / 在线 / 本地选择、端点、模型和 key 输入、预算、连接说明；设置中的秘密只写内存凭据。模型列表探测若提供，必须用户点击，属于非推理请求，不因探测失败断言模型不可用。

- [ ] **Step 1:** 测试初次打开、保存、刷新、复制 prompt、切换模式均无推理请求；点分析时先预览文档范围与端点。批量分析一次确认范围，顺序请求并支持取消。
- [ ] **Step 2:** `npm test -- tests/ai/controller.test.ts tests/components/analysis.test.tsx` 应失败。
- [ ] **Step 3:** 实现“分析当前环节 / 当前流程”，默认单请求超时 90 秒；输入超预算时说明未分析并允许缩小范围。API 无法区分网络 / CORS 原因时使用诚实提示，不编造已诊断原因；不自动切换服务或代理。
- [ ] **Step 4:** 模拟分析中切换分支、改手动状态和文档刷新：返回结果归原分支输入版本；当前手动值保持优先，旧依据不进入最新推荐。关闭 AI 时回到基本规则；本地失败不触发在线请求。测试通过。
- [ ] **Step 5:** 将仅来源引用和摘要写入配置草稿，并沿用用户显式保存；显示时间、模型、依据与过期提示。提交 `feat: 支持按需分析文档并尊重手动状态`。

## Task 12：浏览器验收、Pages 构建与使用说明

**Files:** 创建 `playwright.config.ts`、`tests/e2e/{core,sync,analysis,pages}.spec.ts`、`.github/workflows/{checks,pages}.yml`、`scripts/check-dist.mjs`、`docs/verification.md`、`README.md`；修改 Vite 配置及 package scripts。

**Interfaces:**
- Consumes: 完整网页和所有前述接口；浏览器测试用合成 API 响应，不能依赖用户账户或外部模型收费。
- Produces: `npm run test:e2e`（Chromium 与 WebKit）、`npm run check:dist`，以及可在仓库子路径下打开的静态 `dist/`。Pages 发布工作流仅 `workflow_dispatch`，推送和发布仍等用户授权。

- [ ] **Step 1:** 编写浏览器场景：连接公开 / 私有模拟仓库、选路线和读文档、编辑并切分支、第二个独立浏览器 context 加载已同步配置、冲突保留草稿、模型主动作分析及手动覆盖。
- [ ] **Step 2:** 执行 `npm run test:e2e`，确认当前缺失的完整集成行为失败，再修复实际接线问题；不要用跳过测试或削弱断言掩盖问题。
- [ ] **Step 3:** 配置 base 和 hash 路由，使 `/development-dashboard/` 子路径的入口、资源和刷新都正确；自动检查运行 `npm ci`、typecheck、单元 / 组件测试、构建和浏览器测试。发布工作流只构建和发布静态资源，不读取目标私有文档、不用配置写入 PAT。
- [ ] **Step 4:** 完成构建产物检查：测试用合成敏感标记存在内存或拦截响应中，但不在浏览器持久化存储、URL 或构建产物；真实 key 不通过构建变量注入。实际运行 `npm run typecheck`、`npm test`、`npm run build`、`npm run check:dist`、`npm run test:e2e`，记录统计和失败，不重复扩大无关检查。
- [ ] **Step 5:** README 写明部署、目标仓库只读令牌、独立配置仓库写入令牌、文件规范、同步方式、模型跨域条件、本机模型含义及已知边界。`docs/verification.md` 区分浏览器模拟、真实公共读取、真实私有读取 / 写入、真实在线 / 本地模型。无授权或未提供凭据的真实检查明确记为未执行，不为测试申请无关凭据或产生费用。
- [ ] **Step 6:** 使用本地 preview 进行桌面视觉检查，覆盖 A 布局、缩放画布、中文长标题、详情阅读、窄屏和键盘操作。Playwright WebKit 不等于真实 Safari，Safari / 本地网络权限须另记实际环境结果。检查差异后提交 `feat: 完成首版验收与 GitHub Pages 部署准备`，向用户提供本地预览和真实验证结果；不自行启动远程发布。

## 整体完成条件

所有 12 个任务完成并经过相关检查，设计验收表有实现及验证对应项，源码可本地运行并构建为纯静态资源。权限、缺失、冲突、过期和连接失败不能破坏基本路线阅读。仍受访问凭据或真实设备条件限制的检查需明确列出，不能把它们写成已经通过。

未获得另行授权时，交付止于可审阅的源码、本地预览、测试结果和部署工作流；GitHub 远端创建、push 和线上发布由后续明确操作决定。

## 设计覆盖与自查记录

| 设计内容 | 所属任务 |
| --- | --- |
| 1–4：定位、范围和纯网页架构 | Global Constraints、Task 1、12 |
| 5：A 布局、文档阅读、编辑流程 | Task 3–5 |
| 6：常用范式、命名和通用 prompt | Task 1、3–5 |
| 7：状态、手动优先、下一步 | Task 6、10–11 |
| 8：分支、固定版本读取、刷新 | Task 2–3、7、9 |
| 9：配置同步、快照、冲突 | Task 5、8 |
| 10：凭据、渲染与请求边界 | Task 2、4、8、10、12 |
| 11：AI 输入、连接、引用及失效 | Task 6、10–12 |
| 12–13：工程选择和验收场景 | Task 1–12 |
| 14：已验证与未验证限制 | Task 12 的实际验证记录 |
| Review Focus 五项 | 已映射至对应任务的明确测试 |

2026-10-30 已由当前作者完成自查，没有另行派代理。逐项核对设计覆盖、任务接口名称、数据类型、步骤可检查性、Review Focus 及文档篇幅；修正了凭据 slot 的客户端构造契约、目录读取期间授权失效的识别、分析输入键的规则版本，以及测试辅助数据的来源。

文档结构检查通过：12 个有序任务、61 个待执行步骤、每个任务均有文件和接口说明，代码块闭合。所有任务仍未执行；此结果不代表应用测试已经通过。

## 技术选择的依据

- 采用 React Flow 的节点和连线交互，避免从零构建画布引擎。([官方快速开始](https://reactflow.dev/learn))
- Markdown 采用默认安全的 React 渲染方式及 GFM 插件，保持原始 HTML 关闭。([react-markdown](https://github.com/remarkjs/react-markdown)、[remark-gfm](https://github.com/remarkjs/remark-gfm))
- Vite 的 Node 兼容基线在执行时核实并写入环境和锁文件。([官方环境要求](https://vite.dev/guide/))

## 执行交接

计划尚未执行。用户审阅计划后，选择由当前代理依次实现，或采用每任务独立代理和审阅的方式。此项目接口连接紧密，建议当前代理按顺序实现，并在整体完成时做一次独立审阅，以减少任务交接成本。
