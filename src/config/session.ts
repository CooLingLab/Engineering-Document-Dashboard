import type { ProjectConfig } from '../domain/project';
import type { ConfigRepositoryGateway } from './repository';

export type SyncStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict' | 'uncertain';
export type ConfigSessionState = { config: ProjectConfig; status: SyncStatus; fileSha: string | null;
  unsupportedVersion: number | null; error: string | null; loaded: boolean };

export class ConfigSession {
  state: ConfigSessionState;
  #revision = 0;
  #gateway: ConfigRepositoryGateway;
  constructor(gateway: ConfigRepositoryGateway, config: ProjectConfig, dirty = false) {
    this.#gateway = gateway;
    this.state = { config, status: dirty ? 'dirty' : 'clean', fileSha: null, unsupportedVersion: null, error: null, loaded: false };
  }
  edit(config: ProjectConfig) {
    this.#revision++;
    this.state = { ...this.state, config, status: this.state.status === 'saving' ? 'saving' :
      this.state.status === 'conflict' || this.state.status === 'uncertain' ? this.state.status : 'dirty' };
  }
  async load() {
    const revision = this.#revision;
    try {
      const loaded = await this.#gateway.loadConfiguration(this.state.config.repository.id);
      if (this.#revision !== revision) throw new Error('读取期间本地流程已更改，保留本地草稿。');
      this.state = { ...this.state, config: loaded.config ?? this.state.config, fileSha: loaded.fileSha,
        unsupportedVersion: loaded.unsupportedVersion, loaded: true, error: null,
        status: loaded.config ? 'clean' : this.state.status === 'dirty' ? 'dirty' : 'clean' };
      return loaded;
    } catch (error) {
      this.state = { ...this.state, status: 'error', error: error instanceof Error ? error.message : '读取配置失败。' };
      throw error;
    }
  }
  async save() {
    if (!this.state.loaded) throw new Error('请先读取配置仓库。');
    if (this.state.unsupportedVersion !== null) throw new Error('远端配置使用更新版本，无法覆盖新版本。');
    if (this.state.status === 'saving') throw new Error('正在保存，请稍候。');
    if (this.state.status === 'conflict' || this.state.status === 'uncertain') throw new Error('请先重新读取远端配置，确认后再保存。');
    const revision = this.#revision;
    const config = structuredClone(this.state.config);
    this.state = { ...this.state, status: 'saving', error: null };
    try {
      const result = await this.#gateway.saveConfiguration(config, this.state.fileSha);
      if (result.kind === 'saved') this.state = { ...this.state, fileSha: result.fileSha, status: revision === this.#revision ? 'saved' : 'dirty' };
      else this.state = { ...this.state, status: result.kind };
      return result;
    } catch (error) {
      this.state = { ...this.state, status: 'error', error: error instanceof Error ? error.message : '保存配置失败。' };
      throw error;
    }
  }
}
