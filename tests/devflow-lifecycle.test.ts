import { describe, expect, it } from 'vitest';
import { createProject, getBranchState, type DocumentSnapshot, type Repository } from '../src/domain/project';
import { parseProjectConfig } from '../src/domain/schema';
import { devflowTemplate, DEVFLOW_TEMPLATE_ID, templates } from '../src/templates/catalog';
import { switchTemplate } from '../src/workflow/backup';
import { setManualStatus } from '../src/workflow/status';
import { recommendNext } from '../src/workflow/recommend';
import { indexDocuments } from '../src/documents/match';

const repository: Repository = { id: 100, owner: 'example', name: 'project', defaultBranch: 'main' };
function snapshot(): DocumentSnapshot {
  return { repository, ref: { name: 'main', commitSha: 'aabbcc' }, root: 'docs/development',
    documents: [], issues: [], fetchedAt: '2026-10-30T00:00:00.000Z' };
}
describe('DevFlow V3 canonical lifecycle', () => {
  it('keeps eight stable stages and fixed forward links', () => {
    expect(devflowTemplate.id).toBe(DEVFLOW_TEMPLATE_ID);
    expect(devflowTemplate.graph.nodes.map(({ id }) => id))
      .toEqual(['idea', 'domain', 'concept', 'roadmap', 'ui', 'spec', 'build', 'release']);
    expect(devflowTemplate.graph.edges).toHaveLength(7);
    expect(devflowTemplate.documentRules.expected).toHaveLength(8);
  });

  it('backs up a legacy route before migrating to fixed V3', () => {
    const original = createProject(repository, templates[0]);
    const migrated = switchTemplate(original, devflowTemplate, new Date('2026-10-30T00:00:00.000Z'));
    expect(migrated.template?.id).toBe(DEVFLOW_TEMPLATE_ID);
    expect(migrated.backups[0].graph).toEqual(original.graph);
    expect(original.template?.id).toBe('general-app');
  });

  it('round-trips skipped stage status in the branch config', () => {
    const config = createProject(repository, devflowTemplate);
    const updated = setManualStatus(config, 'main', 'concept', 'skipped', snapshot());
    const parsed = parseProjectConfig(updated);
    expect(parsed.kind).toBe('supported');
    if (parsed.kind === 'supported') {
      expect(getBranchState(parsed.config, 'main').manualStatuses.concept).toBe('skipped');
      const suggestion = recommendNext(parsed.config, snapshot(), indexDocuments(parsed.config, snapshot()), false);
      expect(suggestion.nodeId).not.toBe('concept');
    }
  });
});
