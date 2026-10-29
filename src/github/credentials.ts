export type CredentialSlot = 'target' | 'config' | 'model';

export class MemoryCredentials {
  #values = new Map<CredentialSlot, string>();

  set(slot: CredentialSlot, value: string | undefined): void {
    if (value) this.#values.set(slot, value);
    else this.#values.delete(slot);
  }

  get(slot: CredentialSlot): string | undefined { return this.#values.get(slot); }
  clear(): void { this.#values.clear(); }
}
