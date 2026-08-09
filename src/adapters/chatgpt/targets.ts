import type { LocatorCandidate } from '../../ports/browser-port.js';

export type ChatGptSemanticTarget =
  | 'login'
  | 'prompt-input'
  | 'prompt-submit'
  | 'file-input'
  | 'assistant-response'
  | 'generation-stop'
  | 'conversation-link'
  | 'conversation-message'
  | 'conversation-delete-action'
  | 'conversation-delete-confirm';

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
  'file-input': [
    { kind: 'css', value: 'input[type="file"][multiple]' },
    { kind: 'css', value: 'input[type="file"]' },
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
  'conversation-link': [
    { kind: 'css', value: 'a[href^="/c/"]' },
    { kind: 'css', value: 'a[href*="chatgpt.com/c/"]' },
  ],
  'conversation-message': [{ kind: 'css', value: '[data-message-author-role]' }],
  'conversation-delete-action': [
    { kind: 'role', role: 'menuitem', name: 'Delete' },
    { kind: 'role', role: 'button', name: 'Delete' },
  ],
  'conversation-delete-confirm': [
    { kind: 'role', role: 'button', name: 'Delete' },
    { kind: 'testId', value: 'confirm-delete-conversation' },
  ],
} satisfies Readonly<Record<ChatGptSemanticTarget, readonly LocatorCandidate[]>>;
