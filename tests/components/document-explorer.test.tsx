import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentTree } from '../../src/components/DocumentTree';
import { StageDetails } from '../../src/components/StageDetails';
import { DocumentPreview } from '../../src/components/DocumentPreview';
import { indexDocuments } from '../../src/documents/match';
import { buildDocumentStageLinks, buildDocumentTree } from '../../src/documents/tree';
import { createProject, type DocumentSnapshot } from '../../src/domain/project';
import { devflowTemplate } from '../../src/templates/catalog';

const repo = { id: 123, owner: 'example', name: 'app', defaultBranch: 'main' };
const specPath = 'docs/development/planning/06-spec-plan.md';
const notesPath = 'docs/development/planning/notes.md';
const snapshot: DocumentSnapshot = {
  repository: repo, ref: { name: 'main', commitSha: '123abc' }, root: 'docs/development',
  fetchedAt: '2026-10-30T00:00:00.000Z', issues: [],
  documents: [
    { path: specPath, blobSha: 'one', content: '# Spec heading\nArchitecture decision.', size: 38 },
    { path: notesPath, blobSha: 'two', content: '# Unrelated notes', size: 17 },
  ],
};
const config = createProject(repo, devflowTemplate);
const index = indexDocuments(config, snapshot);
const links = buildDocumentStageLinks(index, config.graph);
const tree = buildDocumentTree(snapshot.root, snapshot.documents);

describe('document explorer', () => {
  it('expands the folder containing the selected stage and highlights its document', () => {
    const onSelect = vi.fn();
    render(<DocumentTree root={snapshot.root} tree={tree} documents={snapshot.documents} links={links}
      selectedStageId="spec" selectedPath={specPath} onSelectDocument={onSelect} />);
    expect(screen.getByRole('tree', { name: '项目文档树' })).toBeInTheDocument();
    const file = screen.getByRole('button', { name: `查看文档：${specPath}` });
    expect(file).toHaveClass('is-stage-linked', 'is-selected');
    expect(screen.getByRole('button', { name: `查看文档：${notesPath}` })).toHaveTextContent('未关联');
    fireEvent.click(screen.getByRole('button', { name: `查看文档：${notesPath}` }));
    expect(onSelect).toHaveBeenCalledWith(notesPath);
  });

  it('supports searching by the full repository-relative path', () => {
    render(<DocumentTree root={snapshot.root} tree={tree} documents={snapshot.documents} links={links}
      selectedStageId="spec" selectedPath={null} onSelectDocument={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索 Markdown 文档' }), { target: { value: 'notes' } });
    const results = screen.getByRole('tree', { name: '文档搜索结果' });
    expect(within(results).getByRole('button', { name: `查看文档：${notesPath}` })).toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: `查看文档：${specPath}` })).toBeNull();
  });

  it('shows the actual folder path, safe Markdown, GitHub link, and stage backlink', () => {
    const onStage = vi.fn();
    render(<DocumentPreview snapshot={snapshot} graph={config.graph} links={links}
      selectedStageId="spec" selectedPath={specPath} onSelectDocument={vi.fn()} onSelectStage={onStage} />);
    const pane = screen.getByRole('region', { name: 'Markdown 文档阅读器' });
    expect(within(pane).getByLabelText('文档路径')).toHaveTextContent('docs / development / planning / 06-spec-plan.md');
    expect(within(pane).getByRole('heading', { name: 'Spec heading' })).toBeInTheDocument();
    expect(within(pane).getByRole('link', { name: /在 GitHub 查看/ })).toHaveAttribute('href',
      `https://github.com/example/app/blob/main/${specPath}`);
    fireEvent.click(within(pane).getByRole('button', { name: devflowTemplate.graph.nodes[5].title }));
    expect(onStage).toHaveBeenCalledWith('spec');
  });

  it('identifies an unrelated file as unlinked without claiming that it belongs to the selected stage', () => {
    render(<DocumentPreview snapshot={snapshot} graph={config.graph} links={links}
      selectedStageId="spec" selectedPath={notesPath} onSelectDocument={vi.fn()} onSelectStage={vi.fn()} />);
    expect(screen.getByText(/未关联 · 可在阶段详情中关联/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unrelated notes' })).toBeInTheDocument();
  });
  it('can attach and remove extra Markdown files from a fixed stage', () => {
    const onChange = vi.fn();
    const onSelectDocument = vi.fn();
    const rendered = render(<StageDetails config={config} snapshot={snapshot} nodeId="spec"
      documentIndex={index} beginnerMode={false} showEmbeddedReader={false}
      onChangeConfig={onChange} onSelectDocument={onSelectDocument} />);
    fireEvent.change(screen.getByRole('combobox', { name: '关联更多已有文档' }), { target: { value: notesPath } });
    fireEvent.click(screen.getByRole('button', { name: '关联到本阶段' }));
    const updated = onChange.mock.calls[0][0];
    const additional = updated.documentRules.expected.find((item: { id: string }) => item.id.startsWith('extra-spec-'));
    expect(additional).toBeDefined();
    expect(updated.documentRules.bindings[additional.id]).toBe(notesPath);
    expect(buildDocumentStageLinks(indexDocuments(updated, snapshot), updated.graph).byPath.get(notesPath))
      .toContain('spec');

    rendered.rerender(<StageDetails config={updated} snapshot={snapshot} nodeId="spec"
      documentIndex={indexDocuments(updated, snapshot)} beginnerMode={false} showEmbeddedReader={false}
      onChangeConfig={onChange} onSelectDocument={onSelectDocument} />);
    fireEvent.click(screen.getByRole('button', { name: `移除文档关联：${notesPath}` }));
    const restored = onChange.mock.calls[1][0];
    expect(restored.documentRules.expected.some((item: { id: string }) => item.id === additional.id)).toBe(false);
    expect(restored.documentRules.bindings[additional.id]).toBeUndefined();
  });

});
