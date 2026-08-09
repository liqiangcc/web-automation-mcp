import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort, LocatorCandidate } from '../../ports/browser-port.js';
import {
  CHATGPT_TARGETS,
  type ChatGptSemanticTarget,
  type ChatGptTargetRegistry,
} from './targets.js';

export type ChatGptTargetObservation =
  | { readonly status: 'FOUND'; readonly candidate: LocatorCandidate }
  | { readonly status: 'ABSENT' }
  | { readonly status: 'UNKNOWN' };

export class ChatGptTargetResolver {
  public constructor(
    private readonly page: BrowserPagePort,
    private readonly registry: ChatGptTargetRegistry = CHATGPT_TARGETS,
  ) {}

  public async find(target: ChatGptSemanticTarget): Promise<LocatorCandidate | undefined> {
    return this.findCandidate(target, async (candidate) => this.page.isVisible(candidate));
  }

  public async findExisting(target: ChatGptSemanticTarget): Promise<LocatorCandidate | undefined> {
    return this.findCandidate(target, async (candidate) => {
      const exists = this.page.exists;
      return exists === undefined
        ? this.page.isVisible(candidate)
        : exists.call(this.page, candidate);
    });
  }

  public async observe(target: ChatGptSemanticTarget): Promise<ChatGptTargetObservation> {
    const candidates = this.registry[target] ?? [];
    if (candidates.length === 0) {
      return { status: 'UNKNOWN' };
    }

    let inspectionFailed = false;
    for (const candidate of candidates) {
      try {
        if (await this.page.isVisible(candidate)) {
          return { status: 'FOUND', candidate };
        }
      } catch {
        inspectionFailed = true;
      }
    }

    return inspectionFailed ? { status: 'UNKNOWN' } : { status: 'ABSENT' };
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

  private async findCandidate(
    target: ChatGptSemanticTarget,
    matches: (candidate: LocatorCandidate) => Promise<boolean>,
  ): Promise<LocatorCandidate | undefined> {
    for (const candidate of this.registry[target] ?? []) {
      try {
        if (await matches(candidate)) {
          return candidate;
        }
      } catch {
        // A single locator failure must not prevent later fallback candidates.
      }
    }

    return undefined;
  }
}
