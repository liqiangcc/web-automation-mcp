import type { ProfileId, ProviderId } from '../domain/conversation.js';

export interface ProfileRecord {
  readonly id: ProfileId;
  readonly provider: ProviderId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProfileStore {
  get(profileId: ProfileId): Promise<ProfileRecord | undefined>;
  put(profile: ProfileRecord): Promise<void>;
}
