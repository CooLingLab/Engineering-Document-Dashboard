import type { ProjectConfig } from '../domain/project';
import { useState } from 'react';
import { templates } from '../templates/catalog';
import { restoreBackup, switchTemplate } from '../workflow/backup';

export type TemplatePickerProps = { config: ProjectConfig; onChange: (config: ProjectConfig) => void; onSelectNode: (id: string | null) => void };
export function TemplatePicker({ config, onChange, onSelectNode }: TemplatePickerProps) {
  const [selected, setSelected] = useState(config.template?.id ?? 'blank');
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const template = templates.find((item) => item.id === selected) ?? null;

  function apply() {
    try {
      const next = switchTemplate(config, template, new Date());
      onChange(next); onSelectNode(next.graph.nodes[0]?.id ?? null); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法切换流程。'); }
  }

  function restore(id: string) {
    try {
      const next = restoreBackup(config, id);
      onChange(next); onSelectNode(next.graph.nodes[0]?.id ?? null); setRestoreId(null); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法恢复流程。'); }
  }

  return <section className="template-panel" aria-label="流程范式">
    <div className="editor-heading"><div><span className="section-kicker">START WITH A PATTERN</span><h3>选择适合你的流程</h3></div></div>
    <label>选择流程范式<select value={selected} onChange={(event) => setSelected(event.target.value)}>{templates.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}<option value="blank">空白画布</option></select></label>
    <div className="template-preview"><strong>{template?.title ?? '空白画布'}</strong><p>{template?.description ?? '从空白画布开始，自己添加开发环节。'}</p><small>{template ? template.graph.nodes.map((node) => node.title).join(' → ') : '暂时没有环节。'}</small></div>
    <p className="subtle">应用后会保留当前流程和各分支状态的备用版本。</p><button type="button" className="secondary-button" onClick={apply}>应用此流程</button>
    {config.backups.length > 0 && <div className="backup-list"><h4>备用流程</h4>{config.backups.map((backup) => <div className="backup-item" key={backup.id}><span>{backup.template?.title ?? '空白流程'} · {new Date(backup.createdAt).toLocaleString()}</span><button type="button" className="secondary-button" onClick={() => setRestoreId(backup.id)}>准备恢复</button><button type="button" className="text-danger" onClick={() => onChange({ ...structuredClone(config), backups: config.backups.filter((item) => item.id !== backup.id) })}>删除备用</button>{restoreId === backup.id && <div className="backup-confirm"><p>恢复将替换当前流程，并先保存当前版本。</p><button type="button" className="secondary-button" onClick={() => restore(backup.id)}>确认恢复</button><button type="button" className="secondary-button" onClick={() => setRestoreId(null)}>取消</button></div>}</div>)}</div>}
    {error && <p className="connection-error" role="alert">{error}</p>}
  </section>;
}
