export interface Workspace {
  id: string;
  name: string;
  path: string;
}

export interface ClientHelloPayload {
  name: string;
  version: string;
  hostname: string;
  telegramUsername: string;
  workspaces: Workspace[];
}

export interface CliPreset {
  name: string;
  command: string;
  args: string[];
}
