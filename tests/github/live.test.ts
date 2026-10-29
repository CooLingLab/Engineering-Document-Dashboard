import { describe, expect, it } from 'vitest';
import { loadDocumentSnapshot } from '../../src/documents/index';
import { indexDocuments } from '../../src/documents/match';
import { createProject } from '../../src/domain/project';
import { GitHubReader } from '../../src/github/client';
import { MemoryCredentials } from '../../src/github/credentials';
import { templates } from '../../src/templates/catalog';

describe.skipIf(process.env.RUN_GITHUB_LIVE !== '1')('real GitHub test repository', () => {
  it('reads different documentation snapshots for main and the iteration branch', async () => {
    const reader = new GitHubReader({ fetcher: fetch, credentials: new MemoryCredentials(), credentialSlot: 'target' });
    const repo = await reader.getRepository({ owner: 'CooLingLab', name: 'Engineering-Document-Dashboard-test-target' });
    const main = await loadDocumentSnapshot(reader, repo, 'main', 'docs/development');
    const iteration = await loadDocumentSnapshot(reader, repo, 'test/iteration', 'docs/development');

    expect(main.documents.map((document) => document.path).sort()).toEqual([
      'docs/development/01-vision.md',
      'docs/development/02-requirements.md',
      'docs/development/03-design.md',
    ]);
    expect(iteration.documents.map((document) => document.path)).toContain('docs/development/04-implementation.md');
    expect(iteration.ref?.commitSha).not.toBe(main.ref?.commitSha);
    const index = indexDocuments(createProject(repo, templates[0]), main);
    expect(index.matches.find((match) => match.documentId === 'design-doc'))
      .toMatchObject({ kind: 'found', contentCheck: 'heading-only' });
    expect(index.matches.find((match) => match.documentId === 'testing-doc')?.kind).toBe('missing');
  }, 30_000);
});
