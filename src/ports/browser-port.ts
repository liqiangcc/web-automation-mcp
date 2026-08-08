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

export interface BrowserPort {
  launchPersistentContext(options: PersistentBrowserOptions): Promise<BrowserContextPort>;
}

export interface BrowserContextPort {
  firstPage(): Promise<BrowserPagePort>;
  close(): Promise<void>;
}

export interface BrowserPagePort {
  goto(url: string): Promise<void>;
  isVisible(locator: LocatorCandidate): Promise<boolean>;
  fill(locator: LocatorCandidate, value: string): Promise<void>;
  click(locator: LocatorCandidate): Promise<void>;
  press(locator: LocatorCandidate, key: string): Promise<void>;
  textContents(locator: LocatorCandidate): Promise<readonly string[]>;
}
