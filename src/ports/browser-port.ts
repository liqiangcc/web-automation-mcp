export type LocatorCandidate =
  | { readonly kind: 'role'; readonly role: string; readonly name?: string }
  | { readonly kind: 'label'; readonly text: string }
  | { readonly kind: 'placeholder'; readonly text: string }
  | { readonly kind: 'testId'; readonly value: string }
  | { readonly kind: 'css'; readonly value: string };

export interface PersistentBrowserOptions {
  readonly profilePath: string;
  readonly headless: boolean;
}

export interface DomChangeWaitOptions {
  readonly timeoutMs: number;
  readonly debounceMs?: number;
}

export type DomChangeWaitResult = 'changed' | 'timeout';

export interface BrowserElementSnapshot {
  readonly text: string;
  readonly attributes: Readonly<Record<string, string | null>>;
}

export interface BrowserPort {
  launchPersistentContext(options: PersistentBrowserOptions): Promise<BrowserContextPort>;
}

export interface BrowserContextPort {
  firstPage(): Promise<BrowserPagePort>;
  close(): Promise<void>;
}

export interface BrowserPagePort {
  goto(url: string): Promise<void>;
  currentUrl?(): string;
  isVisible(locator: LocatorCandidate): Promise<boolean>;
  exists?(locator: LocatorCandidate): Promise<boolean>;
  isEditable?(locator: LocatorCandidate): Promise<boolean>;
  waitForDomChange?(options: DomChangeWaitOptions): Promise<DomChangeWaitResult>;
  elementSnapshots?(
    locator: LocatorCandidate,
    attributeNames: readonly string[],
  ): Promise<readonly BrowserElementSnapshot[]>;
  scrollIntoView?(locator: LocatorCandidate, index: number): Promise<void>;
  fill(locator: LocatorCandidate, value: string): Promise<void>;
  click(locator: LocatorCandidate): Promise<void>;
  press(locator: LocatorCandidate, key: string): Promise<void>;
  setInputFiles?(locator: LocatorCandidate, filePaths: readonly string[]): Promise<void>;
  textContents(locator: LocatorCandidate): Promise<readonly string[]>;
}
