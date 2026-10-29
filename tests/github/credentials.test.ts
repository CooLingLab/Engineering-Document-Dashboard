import { describe, expect, it } from 'vitest';
import { MemoryCredentials } from '../../src/github/credentials';

describe('in-memory credentials', () => {
  it('isolates credential purposes and never serializes the values', () => {
    const credentials = new MemoryCredentials();
    credentials.set('target', 'target-example-secret');
    credentials.set('config', 'config-example-secret');
    expect(credentials.get('target')).toBe('target-example-secret');
    expect(credentials.get('config')).toBe('config-example-secret');
    expect(credentials.get('model')).toBeUndefined();
    expect(JSON.stringify(credentials)).not.toContain('example-secret');
    credentials.clear();
    expect(credentials.get('target')).toBeUndefined();
    expect(credentials.get('config')).toBeUndefined();
  });
});
