import type { StageGuidance, TemplateSnapshot } from '../domain/project';

type Stage = { id: string; title: string; file: string; guidance: StageGuidance; prompt: string };

function makeTemplate(id: string, title: string, description: string, stages: Stage[], loop = false): TemplateSnapshot {
  const nodes = stages.map((stage, order) => ({
    id: stage.id, title: stage.title, order, position: { x: 40 + order * 200, y: 120 },
    guidance: stage.guidance, promptIds: [`${stage.id}-prompt`],
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: `${nodes[index].id}-${node.id}`, source: nodes[index].id, target: node.id,
  }));
  if (loop && nodes.length > 1) {
    edges.push({ id: `${nodes.at(-1)!.id}-${nodes[0].id}`, source: nodes.at(-1)!.id, target: nodes[0].id });
  }
  return {
    id, version: 1, title, description, graph: { nodes, edges },
    documentRules: {
      root: 'docs/development',
      expected: stages.map((stage) => ({ id: `${stage.id}-doc`, nodeId: stage.id, fileName: stage.file })),
      bindings: {},
    },
    prompts: Object.fromEntries(stages.map((stage) => [`${stage.id}-prompt`, stage.prompt])),
  };
}

const general: Stage[] = [
  {
    id: 'vision', title: '想法与目标', file: '01-vision.md',
    guidance: { why: '先明确问题，后续决定才有共同方向。', action: '写下目标用户、需要解决的问题和期望结果。', checks: ['能用一句话说明项目解决什么问题。', '列出当前不打算解决的事情。'] },
    prompt: '请作为产品思考伙伴，帮我梳理软件项目的目标用户、核心问题、预期结果和暂不处理的范围。先向我询问缺少的背景，再整理成简洁的 Markdown 项目愿景。',
  },
  {
    id: 'requirements', title: '需求', file: '02-requirements.md',
    guidance: { why: '明确用户需要什么，减少开发中反复猜测。', action: '列出主要使用场景和能够检查的结果。', checks: ['每项主要需求都有具体使用场景。', '写出可以验证的验收条件。'] },
    prompt: '请帮助我把项目想法整理成 Markdown 需求文档，包括目标用户、使用场景、功能需求、非目标和验收条件。遇到不明确的地方先向我提问，不要自行编造需求。',
  },
  {
    id: 'design', title: '设计', file: '03-design.md',
    guidance: { why: '在动手前考虑结构和关键取舍，有助于避免返工。', action: '描述页面或模块如何协作，以及关键方案的理由。', checks: ['需求与设计能够对应。', '主要技术选择和限制有说明。'] },
    prompt: '请根据我提供的需求，协助设计一个适合项目规模的技术方案。用 Markdown 描述主要模块、数据流、关键取舍和需要验证的问题，并区分已决定与待确认内容。',
  },
  {
    id: 'implementation', title: '开发', file: '04-implementation.md',
    guidance: { why: '把工作拆成可验证的小步，能持续知道下一步做什么。', action: '记录实施顺序、已完成工作和遇到的问题。', checks: ['每一步都有明确结果。', '记录尚未完成或需要处理的问题。'] },
    prompt: '请根据我提供的需求和设计，整理一份适合逐步执行的 Markdown 开发计划。列出有依赖关系的步骤、每步的预期结果和必要验证，不要假设代码已经完成。',
  },
  {
    id: 'testing', title: '测试', file: '05-testing.md',
    guidance: { why: '用实际检查确认应用表现，而不是只看开发记录。', action: '列出关键场景、验证方法和实际结果。', checks: ['覆盖主要使用场景和失败情况。', '区分已通过、失败和未执行的检查。'] },
    prompt: '请依据我提供的需求与实现情况，制定 Markdown 测试清单。覆盖主要用户场景、常见异常和验证方式；为每项保留实际结果，不要声称没有运行过的检查已通过。',
  },
  {
    id: 'delivery', title: '交付', file: '06-delivery.md',
    guidance: { why: '让使用者知道如何运行应用，也让以后维护更容易。', action: '记录运行方式、交付条件和已知限制。', checks: ['新使用者能找到启动方法。', '记录已知问题与需要注意的配置。'] },
    prompt: '请协助整理一份 Markdown 交付说明，包含运行或部署步骤、必要配置、验证结果和已知限制。缺少的实际信息请明确标出，不要虚构。',
  },
];

const mvp: Stage[] = [
  { id: 'mvp-goal', title: '验证目标', file: '01-mvp-goal.md', guidance: { why: '先确定想验证什么，避免原型范围失控。', action: '写下需要验证的假设和目标用户。', checks: ['假设可被观察或验证。'] }, prompt: '请帮助我整理需要验证的产品假设、目标用户和成功信号；不清楚时先向我提问，以 Markdown 输出。' },
  { id: 'mvp-scope', title: '最小范围', file: '02-mvp-scope.md', guidance: { why: '最小范围让你更快获得反馈。', action: '选择验证假设必需的功能。', checks: ['列出本次不做的内容。'] }, prompt: '请根据我提供的假设，帮助划定最小可验证范围，列出必需内容、暂缓内容和取舍理由，以 Markdown 输出。' },
  { id: 'mvp-prototype', title: '制作原型', file: '03-mvp-prototype.md', guidance: { why: '原型让想法能够被体验或检查。', action: '记录原型的制作方式和完成情况。', checks: ['原型可以用于验证选定假设。'] }, prompt: '请为我提供的最小范围拟定原型制作步骤和检查方式，以 Markdown 输出；不要假设原型已完成。' },
  { id: 'mvp-validation', title: '验证与调整', file: '04-mvp-validation.md', guidance: { why: '根据实际反馈决定是否调整方向。', action: '记录观察结果、尚未解决的问题和下一步。', checks: ['区分实际观察和推测。'] }, prompt: '请帮助我设计原型验证记录，包括问题、方法、实际反馈、结论和下一步；缺少实际结果时保留空白。' },
];

const iterative: Stage[] = [
  { id: 'iteration-goal', title: '本轮目标', file: '01-iteration-goal.md', guidance: { why: '每轮聚焦清晰目标，避免范围不断膨胀。', action: '写下本轮要解决的问题和期望结果。', checks: ['本轮目标能够在结束时检查。'] }, prompt: '请帮助我根据已有项目现状整理本轮开发目标、边界和验收条件，以 Markdown 输出。' },
  { id: 'iteration-design', title: '需求与设计', file: '02-iteration-design.md', guidance: { why: '明确本轮改变如何融入已有项目。', action: '描述需求、方案及可能影响。', checks: ['记录与现有方案的关系。'] }, prompt: '请根据我提供的目标，整理本轮需求、设计选择和对已有项目的影响；信息不足时先询问，以 Markdown 输出。' },
  { id: 'iteration-build', title: '开发与测试', file: '03-iteration-build.md', guidance: { why: '同时记录实现和验证能及时发现偏差。', action: '拆分实施步骤并记录检查结果。', checks: ['区分已完成和未验证事项。'] }, prompt: '请根据本轮需求和设计，生成实施步骤和测试清单；分别留出实际实现与验证结果，以 Markdown 输出。' },
  { id: 'iteration-review', title: '回顾与下一轮', file: '04-iteration-review.md', guidance: { why: '回顾帮助你根据证据选择下一轮。', action: '整理本轮结果、问题与后续方向。', checks: ['将已知事实与下一步设想分开。'] }, prompt: '请帮助我整理本轮实际结果、遗留问题、经验和下一轮候选方向；只依据我提供的信息，以 Markdown 输出。' },
];

export const templates: readonly TemplateSnapshot[] = [
  makeTemplate('general-app', '通用应用开发', '适合从想法开始，了解开发一个应用的基本过程。', general),
  makeTemplate('mvp', '原型 / MVP 验证', '适合先用最小范围验证一个想法。', mvp),
  makeTemplate('iterative', '迭代开发', '适合已有项目按轮次持续改进。', iterative, true),
];
