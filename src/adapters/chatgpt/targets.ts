import type { LocatorCandidate } from '../../ports/browser-port.js';

export type ChatGptSemanticTarget =
  'login' | 'prompt-input' | 'prompt-submit' | 'assistant-response' | 'generation-stop';

export type ChatGptTargetRegistry = Readonly<
  Partial<Record<ChatGptSemanticTarget, readonly LocatorCandidate[]>>
>;

export const CHATGPT_TARGETS = {
  login: [
    { kind: 'css', value: '#modal-no-auth-login' },
    { kind: 'testId', value: 'login-button' },
    { kind: 'role', role: 'link', name: 'Log in' },
    { kind: 'role', role: 'button', name: 'Log in' },
  ],
  'prompt-input': [
    { kind: 'role', role: 'textbox', name: 'Message ChatGPT' },
    { kind: 'css', value: '#prompt-textarea' },
    { kind: 'placeholder', text: 'Ask anything' },
  ],
  'prompt-submit': [
    { kind: 'testId', value: 'send-button' },
    { kind: 'role', role: 'button', name: 'Send prompt' },
    { kind: 'role', role: 'button', name: 'Send' },
  ],
  'assistant-response': [
    { kind: 'css', value: '[data-message-author-role="assistant"] .markdown' },
    { kind: 'css', value: '[data-message-author-role="assistant"]' },
  ],
  'generation-stop': [
    { kind: 'testId', value: 'stop-button' },
    { kind: 'role', role: 'button', name: 'Stop generating' },
    { kind: 'role', role: 'button', name: 'Stop streaming' },
  ],
} satisfies Readonly<Record<ChatGptSemanticTarget, readonly LocatorCandidate[]>>;
