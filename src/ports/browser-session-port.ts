import type { ProfileId, ProviderId } from '../domain/conversation.js';
import type { BrowserPagePort } from './browser-port.js';

export interface BrowserSession {
  readonly page: BrowserPagePort;
  close(): Promise<void>;
}

export interface BrowserSessionPort {
  acquire(provider: ProviderId, profileId: ProfileId): Promise<BrowserSession>;
}
