import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort, LocatorCandidate } from '../../ports/browser-port.js';
import {
  CHATGPT_TARGETS,
  type ChatGptSemanticTarget,
  type ChatGptTargetRegistry,
} from './targets.js';

export class ChatGptTargetResolver {
  public constructor(
    private readonly page: BrowserPagePort,
    private readonly registry: ChatGptTargetRegistry = CHATGPT_TARGETS,
  ) {}

  public async find(target: ChatGptSemanticTarget): Promise<LocatorCandidate | undefined> {
    for (const candidate of this.registry[target]) {
      try {
        if (await this.page.isVisible(candidate)) {
          return candidate;
        }
      } catch {
        // A single locator failure must not prevent later fallback candidates.
      }
    }

    return undefined;
  }

  public async require(target: ChatGptSemanticTarget): Promise<LocatorCandidate> {
    const candidate = await this.find(target);
    if (candidate !== undefined) {
      return candidate;
    }

    throw new WebAutomationError(
      'TARGET_NOT_FOUND',
      `Could not resolve ChatGPT semantic target: ${target}`,
    );
  }
}
