import { describe, expect, it } from 'vitest';
import { restoreBackup, switchTemplate, BackupLimitError } from '../../src/workflow/backup';
import { templates } from '../../src/templates/catalog';
import { makeConfig } from '../fixtures';

describe('switching and restoring templates', () => {
  it('saves the old graph, bindings and branch status before switching', () => {
    const original = makeConfig();
    original.branches.main = { manualStatuses: { requirements: 'done' }, documentChoices: {}, analyses: {} };
    original.documentRules.bindings['requirements-doc'] = 'docs/development/custom.md';
    const switched = switchTemplate(original, templates[1], new Date('2026-10-30T00:00:00.000Z'));
    expect(switched.template?.id).toBe('mvp');
    expect(switched.branches).toEqual({});
    expect(switched.backups).toHaveLength(1);
    expect(switched.backups[0].branches.main.manualStatuses.requirements).toBe('done');
    expect(switched.backups[0].documentRules.bindings['requirements-doc']).toBe('docs/development/custom.md');
    switched.graph.nodes[0].title = '修改后';
    expect(templates[1].graph.nodes[0].title).not.toBe('修改后');
    expect(original.backups).toEqual([]);
  });

  it('backs up the current state when restoring an earlier route', () => {
    const original = makeConfig();
    original.branches.main = { manualStatuses: { requirements: 'done' }, documentChoices: {}, analyses: {} };
    const switched = switchTemplate(original, templates[1], new Date('2026-10-30T00:00:00.000Z'));
    const restored = restoreBackup(switched, switched.backups[0].id);
    expect(restored.graph.nodes.map((node) => node.id)).toEqual(['requirements']);
    expect(restored.branches.main.manualStatuses.requirements).toBe('done');
    expect(restored.backups).toHaveLength(2);
    expect(restored.backups[1].template?.id).toBe('mvp');
  });

  it('allows a blank route while preserving the previous one', () => {
    const switched = switchTemplate(makeConfig(), null, new Date('2026-10-30T00:00:00.000Z'));
    expect(switched.template).toBeNull();
    expect(switched.graph.nodes).toEqual([]);
    expect(switched.documentRules.root).toBe('docs/development');
    expect(switched.backups).toHaveLength(1);
  });

  it('keeps a user-selected document directory when changing templates', () => {
    const config = makeConfig();
    config.documentRules.root = 'project-notes';
    const switched = switchTemplate(config, templates[1], new Date('2026-10-30T00:00:00.000Z'));
    expect(switched.documentRules.root).toBe('project-notes');
  });

  it('does not silently erase backups when their limit is reached', () => {
    let config = makeConfig();
    for (let index = 0; index < 10; index++) config = switchTemplate(config, templates[1], new Date(2026, 9, 30, 0, 0, index));
    expect(() => switchTemplate(config, templates[0], new Date())).toThrow(BackupLimitError);
    expect(config.backups).toHaveLength(10);
  });
});
