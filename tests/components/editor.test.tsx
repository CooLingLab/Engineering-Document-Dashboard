import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowEditor } from '../../src/components/WorkflowEditor';
import { TemplatePicker } from '../../src/components/TemplatePicker';
import { indexDocuments } from '../../src/documents/match';
import type { ProjectConfig } from '../../src/domain/project';
import { makeConfig, makeSnapshot } from '../fixtures';

describe('editing a project route', () => {
  it('adds a named stage with an explanation, without inventing a prompt', () => {
    const config = makeConfig();
    const onChange = vi.fn();
    render(<WorkflowEditor config={config} selectedNodeId="requirements" documentIndex={indexDocuments(config, makeSnapshot())} onChange={onChange} onSelectNode={vi.fn()} onUndo={vi.fn()} canUndo={false} />);
    fireEvent.change(screen.getByLabelText('新环节名称'), { target: { value: '复盘' } });
    fireEvent.change(screen.getByLabelText('环节说明'), { target: { value: '总结本轮经验' } });
    fireEvent.click(screen.getByRole('button', { name: '添加环节' }));
    const next = onChange.mock.calls[0][0] as ProjectConfig;
    expect(next.graph.nodes.at(-1)).toMatchObject({ title: '复盘', guidance: { why: '总结本轮经验' }, promptIds: [] });
  });

  it('associates an existing Markdown document with a stage recommendation', () => {
    const config = makeConfig();
    const snapshot = makeSnapshot({ documents: [{ path: 'docs/development/notes.md', blobSha: 'b', content: '# 内容', size: 8 }] });
    const onChange = vi.fn();
    render(<WorkflowEditor config={config} selectedNodeId="requirements" documentIndex={indexDocuments(config, snapshot)} onChange={onChange} onSelectNode={vi.fn()} onUndo={vi.fn()} canUndo={false} />);
    fireEvent.change(screen.getByLabelText('选择文档'), { target: { value: 'docs/development/notes.md' } });
    fireEvent.change(screen.getByLabelText('关联到'), { target: { value: 'requirements-doc' } });
    fireEvent.click(screen.getByRole('button', { name: '关联文档' }));
    const next = onChange.mock.calls[0][0] as ProjectConfig;
    expect(next.documentRules.bindings['requirements-doc']).toBe('docs/development/notes.md');
    expect(indexDocuments(next, snapshot).matches[0].kind).toBe('found');
  });

  it('requires a second action before deleting a stage and keeps a backup', () => {
    const config = makeConfig();
    const onChange = vi.fn();
    render(<WorkflowEditor config={config} selectedNodeId="requirements" documentIndex={indexDocuments(config, makeSnapshot())} onChange={onChange} onSelectNode={vi.fn()} onUndo={vi.fn()} canUndo={false} />);
    fireEvent.click(screen.getByRole('button', { name: '删除当前环节' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    const next = onChange.mock.calls[0][0] as ProjectConfig;
    expect(next.graph.nodes).toEqual([]);
    expect(next.backups[0].graph.nodes[0].id).toBe('requirements');
  });

  it('previews and switches to a blank canvas while preserving the old route', () => {
    const config = makeConfig();
    const onChange = vi.fn();
    render(<TemplatePicker config={config} onChange={onChange} onSelectNode={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('选择流程范式'), { target: { value: 'blank' } });
    expect(screen.getByText(/从空白画布开始/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '应用此流程' }));
    const next = onChange.mock.calls[0][0] as ProjectConfig;
    expect(next.graph.nodes).toEqual([]);
    expect(next.backups[0].graph.nodes[0].id).toBe('requirements');
  });
});
