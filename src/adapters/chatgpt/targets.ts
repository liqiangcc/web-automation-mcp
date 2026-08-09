import type { LocatorCandidate } from '../../ports/browser-port.js';

export type ChatGptSemanticTarget = 'login' | 'prompt-input' | 'prompt-submit';

export type ChatGptTargetRegistry = Readonly<
  Record<ChatGptSemanticTarget, readonly LocatorCandidate[]>
>;

export const CHATGPT_TARGETS = {
  login: [
    { kind: 'role', role: 'link', name: 'Log in' },
    { kind: 'role', role: 'button', name: 'Log in' },
  ],
  'prompt-input': [
    { kind: 'role', role: 'textbox' },
    { kind: 'css', value: '#prompt-textarea' },
    { kind: 'placeholder', text: 'Ask anything' },
  ],
  'prompt-submit': [
    { kind: 'testId', value: 'send-button' },
    { kind: 'role', role: 'button', name: 'Send prompt' },
    { kind: 'role', role: 'button', name: 'Send' },
  ],
} satisfies ChatGptTargetRegistry;
