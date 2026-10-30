import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownReader } from '../../src/components/MarkdownReader';
import { StageDetails } from '../../src/components/StageDetails';
import { indexDocuments } from '../../src/documents/match';
import { makeConfig, makeSnapshot } from '../fixtures';

describe('safe read-only document display', () => {
  it('renders Markdown without executing HTML, dangerous links or remote images', () => {
    const content = '# 标题\n\n<script>window.bad = true</script>\n\n[危险](javascript:alert(1))\n\n![图片](https://evil.example/track.png)\n\n| 名称 | 状态 |\n| --- | --- |\n| 阅读 | 完成 |\n\n- [x] 查看';
    const { container } = render(<MarkdownReader content={content} documentPath="docs/development/02-requirements.md" snapshot={makeSnapshot()} />);
    expect(screen.getByRole('heading', { name: '标题' })).toBeInTheDocument();
    expect(screen.getByText('阅读')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('危险').closest('a')?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
  });

  it('resolves a relative link against the selected GitHub branch and document', () => {
    const snapshot = makeSnapshot({ ref: { name: 'test/iteration', commitSha: 'c1' } });
    render(<MarkdownReader content="[指南](./guide.md)" documentPath="docs/development/02-requirements.md" snapshot={snapshot} />);
    expect(screen.getByRole('link', { name: '指南' })).toHaveAttribute('href',
      'https://github.com/example/project/blob/test%2Fiteration/docs/development/guide.md');
  });

  it('copies the static prompt without including the project document', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const config = makeConfig();
    const snapshot = makeSnapshot({ documents: [{
      path: 'docs/development/02-requirements.md', blobSha: 'b1', content: '# 需求\n私人示例正文', size: 24,
    }] });
    render(<StageDetails config={config} snapshot={snapshot} nodeId="requirements" documentIndex={indexDocuments(config, snapshot)} beginnerMode />);
    fireEvent.click(screen.getByRole('button', { name: '复制 prompt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText).toHaveBeenCalledWith(config.template!.prompts['requirements-prompt']);
    expect(writeText.mock.calls[0][0]).not.toContain('私人示例正文');
    expect(writeText.mock.calls[0][0]).not.toContain('example/project');
  });

  it('shows selectable prompt text if clipboard access fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) }, configurable: true });
    const config = makeConfig();
    const snapshot = makeSnapshot();
    render(<StageDetails config={config} snapshot={snapshot} nodeId="requirements" documentIndex={indexDocuments(config, snapshot)} beginnerMode />);
    fireEvent.click(screen.getByRole('button', { name: '复制 prompt' }));
    expect(await screen.findByText(/请手动复制/)).toBeInTheDocument();
    expect(screen.getByText(config.template!.prompts['requirements-prompt'])).toBeInTheDocument();
  });

  it('lets the user mark a stage and defer a missing document', () => {
    const config = makeConfig(); const snapshot = makeSnapshot(); const onChange = vi.fn();
    render(<StageDetails config={config} snapshot={snapshot} nodeId="requirements" documentIndex={indexDocuments(config, snapshot)} beginnerMode onChangeConfig={onChange} />);
    fireEvent.change(screen.getByLabelText('手动状态'), { target: { value: 'done' } });
    expect(onChange.mock.calls[0][0].branches.main.manualStatuses.requirements).toBe('done');
    fireEvent.change(screen.getByLabelText('文档取舍：02-requirements.md'), { target: { value: 'later' } });
    expect(onChange.mock.calls[1][0].branches.main.documentChoices['requirements-doc']).toBe('later');
  });
});
