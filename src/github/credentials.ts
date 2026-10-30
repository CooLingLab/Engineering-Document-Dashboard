export type CredentialSlot = 'target' | 'config' | 'model';

export class MemoryCredentials {
  #values = new Map<CredentialSlot, string>();
  #versions = new Map<CredentialSlot, number>();
  #listeners = new Set<(slot: CredentialSlot) => void>();

  set(slot: CredentialSlot, value: string | undefined): void {
    const next = value || undefined;
    const changed = this.#values.get(slot) !== next;
    if (changed) this.#versions.set(slot, this.version(slot) + 1);
    if (value) this.#values.set(slot, value);
    else this.#values.delete(slot);
    if (changed) for (const listener of this.#listeners) listener(slot);
  }

  get(slot: CredentialSlot): string | undefined { return this.#values.get(slot); }
  version(slot: CredentialSlot): number { return this.#versions.get(slot) ?? 0; }
  onChange(listener: (slot: CredentialSlot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  clear(): void { for (const slot of [...this.#values.keys()]) this.set(slot, undefined); }
}
