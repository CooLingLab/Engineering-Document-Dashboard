import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileWorkflowEditor } from '../../src/components/MobileWorkflowEditor';
import { indexDocuments } from '../../src/documents/match';
import type { ProjectConfig, WorkflowNode } from '../../src/domain/project';
import { applyGraphCommand } from '../../src/workflow/graph';
import { makeConfig, makeSnapshot } from '../fixtures';

const another: WorkflowNode = {
  id: 'prototype', title: 'UI Prototype', order: 2, position: { x: 280, y: 120 },
  guidance: { why: '验证界面', action: '检查原型', checks: [] }, promptIds: [],
};
function mount(config: ProjectConfig = makeConfig()) {
  const onChange = vi.fn();
  const onSelectNode = vi.fn();
  const view = render(<MobileWorkflowEditor config={config} selectedNodeId={null}
    nodeViews={{}} documentIndex={indexDocuments(config, makeSnapshot())} documentChoices={{}}
    onChange={onChange} onSelectNode={onSelectNode} onUndo={vi.fn()} canUndo={false} />);
  return { ...view, onChange, onSelectNode };
}

describe('mobile workflow editor', () => {
  it('inserts a stage through large list controls without requiring drag', () => {
    const { onChange } = mount();
    fireEvent.click(screen.getByRole('button', { name: /在这里插入/ }));
    fireEvent.change(screen.getByLabelText('新环节名称'), { target: { value: '设计原型' } });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    const next = onChange.mock.calls[0][0] as ProjectConfig;
    expect(next.graph.nodes).toHaveLength(2);
    expect(next.graph.nodes.find((node) => node.title === '设计原型')?.order).toBe(1);
  });

  it('edits a stage from a bottom sheet and saves its name and purpose', () => {
    const { onChange } = mount();
    fireEvent.click(screen.getByRole('button', { name: /需求.*点按编辑/ }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '需求澄清' } });
    fireEvent.change(screen.getByLabelText('环节目的'), { target: { value: '确认核心功能' } });
    fireEvent.click(screen.getByRole('button', { name: '保存环节信息' }));
    const next = onChange.mock.calls[0][0] as ProjectConfig;
    expect(next.graph.nodes[0].title).toBe('需求澄清');
    expect(next.graph.nodes[0].guidance.why).toBe('确认核心功能');
  });

  it('changes list order while preserving connected edges', () => {
    let config = applyGraphCommand(makeConfig(), { type: 'add-node', node: another });
    config = applyGraphCommand(config, { type: 'add-edge', edge: { id: 'a', source: 'requirements', target: 'prototype' } });
    const { onChange } = mount(config);
    fireEvent.click(screen.getByRole('button', { name: '上移UI Prototype' }));
    const next = onChange.mock.calls[0][0] as ProjectConfig;
    expect(next.graph.nodes.find((node) => node.id === 'prototype')?.order).toBe(0);
    expect(next.graph.edges).toEqual(config.graph.edges);
  });

  it('creates a link by selecting a destination, not by dragging handles', () => {
    const config = applyGraphCommand(makeConfig(), { type: 'add-node', node: another });
    const { onChange } = mount(config);
    fireEvent.click(screen.getByRole('button', { name: /需求.*点按编辑/ }));
    fireEvent.change(screen.getByLabelText('选择连接目标'), { target: { value: 'prototype' } });
    fireEvent.click(screen.getByRole('button', { name: '添加连线' }));
    const next = onChange.mock.calls[0][0] as ProjectConfig;
    expect(next.graph.edges).toMatchObject([{ source: 'requirements', target: 'prototype' }]);
  });
});
