import type { BrowserPagePort, LocatorCandidate } from '../../ports/browser-port.js';
import { ChatGptTargetResolver } from './target-resolver.js';

export type ChatGptPageHealth = 'HEALTHY' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'UNKNOWN';

const STATUS_REGION: LocatorCandidate = {
  kind: 'css',
  value: '[role="alert"], [role="status"], [data-testid*="error" i]',
};
const BODY: LocatorCandidate = { kind: 'css', value: 'body' };

const RATE_LIMIT_PATTERNS = [
  /too many requests/i,
  /rate[ -]?limit/i,
  /request limit/i,
  /try again later/i,
  /unusual activity/i,
  /temporarily blocked/i,
  /访问过于频繁/,
  /请求过于频繁/,
  /请求太频繁/,
  /操作过于频繁/,
  /稍后再试/,
];

const PROVIDER_ERROR_PATTERNS = [
  /something went wrong/i,
  /unable to load/i,
  /failed to load/i,
  /service unavailable/i,
  /temporarily unavailable/i,
  /出错了/,
  /无法加载/,
  /服务不可用/,
];

export class ChatGptPageHealthProbe {
  public constructor(private readonly page: BrowserPagePort) {}

  public async check(): Promise<ChatGptPageHealth> {
    const statusRegionSignal = classifyText(await safeText(this.page, STATUS_REGION));
    if (statusRegionSignal !== undefined) {
      return statusRegionSignal;
    }

    const prompt = await new ChatGptTargetResolver(this.page).observe('prompt-input');
    if (prompt.status === 'FOUND') {
      return 'HEALTHY';
    }

    // Only inspect whole-page text when the normal composer is absent. This avoids
    // treating ordinary conversation content mentioning rate limits as provider state.
    const bodySignal = classifyText(await safeText(this.page, BODY));
    if (bodySignal !== undefined) {
      return bodySignal;
    }

    return 'UNKNOWN';
  }
}

function classifyText(text: string): Exclude<ChatGptPageHealth, 'HEALTHY' | 'UNKNOWN'> | undefined {
  if (RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'RATE_LIMITED';
  }
  if (PROVIDER_ERROR_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'PROVIDER_ERROR';
  }
  return undefined;
}

async function safeText(page: BrowserPagePort, locator: LocatorCandidate): Promise<string> {
  try {
    return (await page.textContents(locator)).join('\n');
  } catch {
    return '';
  }
}
