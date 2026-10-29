import { describe, expect, it } from 'vitest';
import { createProject, getBranchState } from '../../src/domain/project';
import { parseProjectConfig } from '../../src/domain/schema';
import { templates } from '../../src/templates/catalog';
import { makeSnapshot } from '../fixtures';

describe('project configuration', () => {
  it('starts with a personal copy of the recommended development route', () => {
    const config = createProject(makeSnapshot().repository, templates[0]);

    expect(getBranchState(config, 'main').manualStatuses).toEqual({});
    expect(config.template?.id).toBe('general-app');
    expect(config.documentRules.root).toBe('docs/development');
    expect(config.graph.nodes.map((node) => node.title)).toEqual([
      '想法与目标', '需求', '设计', '开发', '测试', '交付',
    ]);

    config.graph.nodes[0].title = '用户修改';
    expect(templates[0].graph.nodes[0].title).toBe('想法与目标');
    expect(config.template?.graph.nodes[0].title).toBe('想法与目标');
  });

  it('creates an empty route without inventing branch progress', () => {
    const config = createProject(makeSnapshot().repository, null);
    expect(config.graph.nodes).toEqual([]);
    expect(config.graph.edges).toEqual([]);
    expect(config.documentRules.root).toBe('docs/development');
    expect(getBranchState(config, 'feature/login').manualStatuses).toEqual({});
    expect(config.branches).toEqual({});
  });

  it('does not mistake inherited object properties for branch state', () => {
    const config = createProject(makeSnapshot().repository, templates[0]);
    expect(getBranchState(config, '__proto__')).toEqual({
      manualStatuses: {}, documentChoices: {}, analyses: {},
    });
    const stored = { manualStatuses: { requirements: 'done' }, documentChoices: {}, analyses: {} };
    Object.defineProperty(config.branches, '__proto__', { value: stored, enumerable: true });
    expect(getBranchState(config, '__proto__')).toEqual(stored);
  });

  it('returns unsupported versions without attempting a destructive migration', () => {
    expect(parseProjectConfig({ schemaVersion: 99 })).toEqual({
      kind: 'unsupported-version', version: 99,
    });
  });

  it('accepts valid saved configuration and rejects incomplete configuration', () => {
    const config = createProject(makeSnapshot().repository, templates[0]);
    expect(parseProjectConfig(config)).toEqual({ kind: 'supported', config });
    expect(() => parseProjectConfig({ schemaVersion: 1, repository: {} })).toThrow();
  });

  it('provides actionable guidance and a reusable prompt for each built-in stage', () => {
    expect(templates.map((template) => template.id)).toEqual([
      'general-app', 'mvp', 'iterative',
    ]);
    for (const template of templates) {
      for (const node of template.graph.nodes) {
        expect(node.guidance.why.trim()).not.toBe('');
        expect(node.guidance.action.trim()).not.toBe('');
        expect(node.guidance.checks.length).toBeGreaterThan(0);
        expect(node.promptIds.length).toBeGreaterThan(0);
        expect(template.prompts[node.promptIds[0]].trim()).not.toBe('');
      }
    }
  });
});
