import tseslint from 'typescript-eslint';

const coreLayerRestrictions = [
  '@modelcontextprotocol/*',
  'playwright',
  'playwright/*',
  '../adapters/**',
  '../../adapters/**',
  '../mcp/**',
  '../../mcp/**',
  '../session/**',
  '../../session/**',
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.web-automation-mcp/**',
      'profiles/**',
      'diagnostics/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/domain/**/*.ts', 'src/ports/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: coreLayerRestrictions,
              message: 'Core layers must not depend on MCP, browser implementations, sessions, or adapters.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@modelcontextprotocol/*',
                'playwright',
                'playwright/*',
                '../adapters/**',
                '../../adapters/**',
                '../mcp/**',
                '../../mcp/**',
              ],
              message: 'Application code must depend on domain/ports, not MCP or concrete adapters.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/adapters/playwright/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../chatgpt/**', '../../application/**', '../../mcp/**', '../../session/**'],
              message: 'The Playwright adapter owns browser mechanics only and must not depend on provider or orchestration concerns.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/adapters/chatgpt/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@modelcontextprotocol/*',
                'playwright',
                'playwright/*',
                '../../application/**',
                '../../mcp/**',
                '../../session/**',
              ],
              message: 'The ChatGPT adapter owns provider page semantics and must depend only on domain/ports, not Playwright, MCP, application orchestration, or session infrastructure.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/session/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@modelcontextprotocol/*', '../adapters/chatgpt/**', '../mcp/**'],
              message: 'Session infrastructure must not depend on MCP or ChatGPT page semantics.',
            },
          ],
        },
      ],
    },
  },
);
