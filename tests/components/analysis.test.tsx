import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModelPanel } from '../../src/components/ModelPanel';
import { MemoryCredentials } from '../../src/github/credentials';
import { makeConfig, makeSnapshot } from '../fixtures';

describe('analysis controls', () => {
  it('does not call a model when enabling it or preparing a preview', () => {
    const fetcher = vi.fn();
    const snapshot = makeSnapshot({ documents: [{ path: 'docs/development/02-requirements.md', blobSha: 'blob', content: '# 需求\n登录功能', size: 15 }] });
    render(<ModelPanel config={makeConfig()} snapshot={snapshot} selectedNodeId="requirements" credentials={new MemoryCredentials()} fetcher={fetcher} onEnabledChange={vi.fn()} onCommit={vi.fn()} />);
    fireEvent.click(screen.getByText(/文档分析设置/));
    fireEvent.change(screen.getByLabelText('分析方式'), { target: { value: 'openai-compatible' } });
    fireEvent.change(screen.getByLabelText('模型端点'), { target: { value: 'https://model.example/api' } });
    fireEvent.change(screen.getByLabelText('模型名称'), { target: { value: 'sample' } });
    fireEvent.click(screen.getByRole('button', { name: '分析当前环节' }));
    expect(within(screen.getByRole('region', { name: '分析范围预览' })).getByText(/docs\/development\/02-requirements.md/)).toBeInTheDocument();
    expect(screen.getByText(/model.example/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认发送并分析' })).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('lets the user omit a document and warns that the result is partial', () => {
    const snapshot = makeSnapshot({ documents: [{ path: 'docs/development/02-requirements.md', blobSha: 'blob', content: '# 需求\n登录功能', size: 15 }] });
    render(<ModelPanel config={makeConfig()} snapshot={snapshot} selectedNodeId="requirements" credentials={new MemoryCredentials()} fetcher={vi.fn()} onEnabledChange={vi.fn()} onCommit={vi.fn()} />);
    fireEvent.click(screen.getByText(/文档分析设置/));
    fireEvent.change(screen.getByLabelText('分析方式'), { target: { value: 'openai-compatible' } });
    fireEvent.change(screen.getByLabelText('模型端点'), { target: { value: 'https://model.example/api' } });
    fireEvent.change(screen.getByLabelText('模型名称'), { target: { value: 'sample' } });
    fireEvent.click(screen.getByLabelText('选择分析文档：docs/development/02-requirements.md'));
    fireEvent.click(screen.getByRole('button', { name: '分析当前环节' }));
    expect(screen.getByText(/部分文档未选/)).toBeInTheDocument();
    expect(screen.getByText(/不发送模型请求/)).toBeInTheDocument();
  });
});
