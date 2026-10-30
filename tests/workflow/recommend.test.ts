import { describe, expect, it } from 'vitest';
import { indexDocuments } from '../../src/documents/match';
import { createProject } from '../../src/domain/project';
import { recommendNext } from '../../src/workflow/recommend';
import { setDocumentChoice, setManualStatus } from '../../src/workflow/status';
import { templates } from '../../src/templates/catalog';
import { makeConfig, makeSnapshot } from '../fixtures';

describe('next-step suggestions', () => {
  it('suggests the missing required document without claiming the stage is incomplete', () => {
    const config = makeConfig(); const snapshot = makeSnapshot();
    expect(recommendNext(config, snapshot, indexDocuments(config, snapshot), false)).toMatchObject({
      nodeId: 'requirements', documentId: 'requirements-doc', action: 'create-document', source: 'template',
    });
  });

  it.each(['later', 'not-needed'] as const)('does not repeatedly prompt for a document marked %s', (choice) => {
    const snapshot = makeSnapshot();
    const config = setDocumentChoice(makeConfig(), 'main', 'requirements-doc', choice);
    expect(recommendNext(config, snapshot, indexDocuments(config, snapshot), false).documentId).not.toBe('requirements-doc');
  });

  it('prioritizes a stage explicitly marked in progress', () => {
    const snapshot = makeSnapshot();
    const config = setManualStatus(createProject(snapshot.repository, templates[0]), 'main', 'testing', 'in-progress');
    expect(recommendNext(config, snapshot, indexDocuments(config, snapshot), false)).toMatchObject({ nodeId: 'testing', source: 'manual' });
  });

  it('offers a choice instead of stalling on a cycle, and supports a blank graph', () => {
    const snapshot = makeSnapshot();
    const cycle = createProject(snapshot.repository, templates[2]);
    expect(recommendNext(cycle, snapshot, indexDocuments(cycle, snapshot), false).nodeId).toBe('iteration-goal');
    const blank = createProject(snapshot.repository, null);
    expect(recommendNext(blank, snapshot, indexDocuments(blank, snapshot), false).action).toBe('add-stage');
  });

  it('does not recommend missing documents when the scan was incomplete', () => {
    const config = makeConfig();
    const snapshot = makeSnapshot({ issues: [{ path: 'docs/development', kind: 'incomplete', message: '未读完' }] });
    expect(recommendNext(config, snapshot, indexDocuments(config, snapshot), false).action).toBe('review-stage');
  });
});
