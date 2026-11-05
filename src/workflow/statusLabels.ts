import type { NodeView } from '../domain/project';

export const statusLabels: Record<NodeView['status'], string> = {
  unknown: '未判断',
  'not-started': '未开始',
  'in-progress': '进行中',
  done: '已完成',
  deferred: '暂缓',
  skipped: '已跳过',
};
