import { useState } from 'react';
import type { ProjectConfig } from '../domain/project';
import { restoreBackup } from '../workflow/backup';

type Props = {
  config: ProjectConfig;
  disabled: boolean;
  onChange: (next: ProjectConfig) => void;
  onSelectNode: (id: string | null) => void;
};

export function BackupManager({ config, disabled, onChange, onSelectNode }: Props) {
  const [error, setError] = useState('');
  if (config.backups.length === 0) return null;

  function restore(id: string) {
    if (!window.confirm('恢复旧流程会替换当前路线，并先备份当前版本。确认恢复吗？')) return;
    try {
      const next = restoreBackup(config, id);
      onChange(next);
      onSelectNode(next.graph.nodes[0]?.id ?? null);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法恢复备份。');
    }
  }

  function remove(id: string) {
    if (!window.confirm('确定永久删除这份历史流程备份吗？此操作不能撤销。')) return;
    onChange({ ...structuredClone(config), backups: config.backups.filter((item) => item.id !== id) });
    setError('');
  }

  return <details className="backup-manager">
    <summary>历史流程备份（{config.backups.length}）</summary>
    <p>迁移或恢复不会修改目标 GitHub 仓库；请先保存需要保留的配置草稿。</p>
    {config.backups.map((backup) => <div className="backup-manager-item" key={backup.id}>
      <span>{backup.template?.title ?? '自定义流程'} · {new Date(backup.createdAt).toLocaleString()}</span>
      <button type="button" className="secondary-button" disabled={disabled || config.backups.length >= 10} onClick={() => restore(backup.id)}>恢复</button>
      <button type="button" className="text-danger" disabled={disabled} onClick={() => remove(backup.id)}>删除</button>
    </div>)}
    {config.backups.length >= 10 && <p>备份已达到上限（10），需要先删除不再需要的备份才能恢复或迁移。</p>}
    {error && <p role="alert" className="connection-error">{error}</p>}
  </details>;
}
