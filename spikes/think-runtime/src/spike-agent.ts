import { Think } from '@cloudflare/think';
import { scriptedModel } from './scripted-model.ts';

/** Host API shared by both spike agents: scripted model, provider connection, turns, workspace reads. */
export abstract class SpikeAgent extends Think {
  waitForMcpConnections = true;

  getModel() {
    return scriptedModel(names => void this.ctx.storage.put('offered-tools', names)) as never;
  }
  async connectProvider(url: string) {
    return this.addMcpServer('provider', url, { callbackHost: 'https://spike.test', transport: { type: 'streamable-http' } });
  }
  async turn(text: string) {
    const result = await this.runTurn({ input: text });
    return { status: (result as { status?: string }).status };
  }
  async readWorkspaceFile(path: string) {
    return this._hostReadFile(path);
  }
}
