import { describe, expect, it } from 'vitest';
import type { WorkflowNode } from '../../src/domain/project';
import { applyGraphCommand } from '../../src/workflow/graph';
import { makeConfig } from '../fixtures';

const extra: WorkflowNode = {
  id: 'custom', title: '自定义环节', order: 1, position: { x: 300, y: 80 },
  guidance: { why: '了解目的', action: '填写说明', checks: [] }, promptIds: [],
};

describe('editing a development flow', () => {
  it('adds and renames a stage without changing the original configuration', () => {
    const initial = makeConfig();
    const added = applyGraphCommand(initial, { type: 'add-node', node: extra });
    const renamed = applyGraphCommand(added, { type: 'rename-node', id: 'custom', title: '  验证  ' });
    expect(initial.graph.nodes).toHaveLength(1);
    expect(renamed.graph.nodes.find((node) => node.id === 'custom')?.title).toBe('验证');
    expect(() => applyGraphCommand(added, { type: 'add-node', node: extra })).toThrow();
    expect(() => applyGraphCommand(added, { type: 'rename-node', id: 'custom', title: '   ' })).toThrow();
  });

  it('allows parallel connections and cycles without accepting dangling edges', () => {
    const added = applyGraphCommand(makeConfig(), { type: 'add-node', node: extra });
    const forward = applyGraphCommand(added, { type: 'add-edge', edge: { id: 'a', source: 'requirements', target: 'custom' } });
    const loop = applyGraphCommand(forward, { type: 'add-edge', edge: { id: 'b', source: 'custom', target: 'requirements' } });
    expect(loop.graph.edges).toHaveLength(2);
    expect(() => applyGraphCommand(loop, { type: 'add-edge', edge: { id: 'bad', source: 'missing', target: 'custom' } })).toThrow();
    expect(applyGraphCommand(loop, { type: 'remove-edge', id: 'a' }).graph.edges.map((edge) => edge.id)).toEqual(['b']);
  });

  it('moves a stage without altering a manual status or existing analysis', () => {
    const config = makeConfig();
    config.branches.main = { manualStatuses: { requirements: 'done' }, documentChoices: {}, analyses: {} };
    const moved = applyGraphCommand(config, { type: 'move-node', id: 'requirements', position: { x: 450, y: 90 } });
    expect(moved.graph.nodes[0].position).toEqual({ x: 450, y: 90 });
    expect(moved.branches.main).toEqual(config.branches.main);
  });

  it('backs up the route and removes dangling references when deleting a stage', () => {
    let config = applyGraphCommand(makeConfig(), { type: 'add-node', node: extra });
    config = applyGraphCommand(config, { type: 'add-edge', edge: { id: 'a', source: 'requirements', target: 'custom' } });
    config.branches.main = { manualStatuses: { requirements: 'done' }, documentChoices: { 'requirements-doc': 'later' }, analyses: {} };
    config.documentRules.bindings['requirements-doc'] = 'docs/development/requirements.md';
    const next = applyGraphCommand(config, { type: 'remove-node', id: 'requirements' });
    expect(next.graph.nodes.map((node) => node.id)).toEqual(['custom']);
    expect(next.graph.edges).toEqual([]);
    expect(next.documentRules.expected).toEqual([]);
    expect(next.branches.main.manualStatuses).toEqual({});
    expect(next.backups.at(-1)?.graph.nodes.map((node) => node.id)).toEqual(['requirements', 'custom']);
    expect(next.backups.at(-1)?.branches.main.manualStatuses.requirements).toBe('done');
  });

  it('reorders stages without silently changing their dependency edges', () => {
    const withNode = applyGraphCommand(makeConfig(), { type: 'add-node', node: extra });
    const linked = applyGraphCommand(withNode, { type: 'add-edge', edge: { id: 'a', source: 'requirements', target: 'custom' } });
    const reordered = applyGraphCommand(linked, { type: 'reorder-nodes', ids: ['custom', 'requirements'] });
    expect(reordered.graph.nodes.find((node) => node.id === 'custom')?.order).toBe(0);
    expect(reordered.graph.nodes.find((node) => node.id === 'requirements')?.order).toBe(1);
    expect(reordered.graph.edges).toEqual(linked.graph.edges);
    expect(linked.graph.nodes.find((node) => node.id === 'custom')?.order).toBe(1);
    expect(() => applyGraphCommand(linked, { type: 'reorder-nodes', ids: ['custom', 'custom'] })).toThrow();
  });

  it('automatically lays out branches and cycles without losing nodes or links', () => {
    const withNode = applyGraphCommand(makeConfig(), { type: 'add-node', node: extra });
    const linked = applyGraphCommand(withNode, { type: 'add-edge', edge: { id: 'a', source: 'requirements', target: 'custom' } });
    const layout = applyGraphCommand(linked, { type: 'auto-layout' });
    const start = layout.graph.nodes.find((node) => node.id === 'requirements')!;
    const end = layout.graph.nodes.find((node) => node.id === 'custom')!;
    expect(end.position.x).toBeGreaterThan(start.position.x);
    const cyclic = applyGraphCommand(linked, { type: 'add-edge', edge: { id: 'b', source: 'custom', target: 'requirements' } });
    const arrangedCycle = applyGraphCommand(cyclic, { type: 'auto-layout' });
    expect(arrangedCycle.graph.nodes).toHaveLength(2);
    expect(arrangedCycle.graph.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
    expect(arrangedCycle.graph.edges).toEqual(cyclic.graph.edges);
  });

});
