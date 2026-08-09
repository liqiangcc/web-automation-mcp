import type { BrowserPagePort, LocatorCandidate } from '../../src/ports/browser-port.js';

export interface SelectorDriftFixtureOptions {
  readonly visibleCandidates?: readonly LocatorCandidate[];
  readonly failingCandidates?: readonly LocatorCandidate[];
  readonly textByCandidate?: ReadonlyMap<string, readonly string[]>;
}

export class SelectorDriftFixturePage implements BrowserPagePort {
  public readonly inspected: LocatorCandidate[] = [];
  public readonly filled: Array<{ locator: LocatorCandidate; value: string }> = [];
  public readonly clicked: LocatorCandidate[] = [];

  private readonly visible: Set<string>;
  private readonly failing: Set<string>;
  private readonly textByCandidate: ReadonlyMap<string, readonly string[]>;

  public constructor(options: SelectorDriftFixtureOptions = {}) {
    this.visible = new Set((options.visibleCandidates ?? []).map(locatorKey));
    this.failing = new Set((options.failingCandidates ?? []).map(locatorKey));
    this.textByCandidate = options.textByCandidate ?? new Map();
  }

  public async goto(): Promise<void> {}

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    this.inspected.push(locator);
    if (this.failing.has(locatorKey(locator))) {
      throw new Error('simulated selector drift');
    }
    return this.visible.has(locatorKey(locator));
  }

  public async fill(locator: LocatorCandidate, value: string): Promise<void> {
    this.filled.push({ locator, value });
  }

  public async click(locator: LocatorCandidate): Promise<void> {
    this.clicked.push(locator);
  }

  public async press(): Promise<void> {}

  public async textContents(locator: LocatorCandidate): Promise<readonly string[]> {
    return this.textByCandidate.get(locatorKey(locator)) ?? [];
  }
}

export function locatorKey(locator: LocatorCandidate): string {
  return JSON.stringify(locator);
}
