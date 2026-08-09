import { ChatGptConversationNavigator } from '../adapters/chatgpt/conversation-navigator.js';
import { ChatGptHistoryDiagnostic } from '../adapters/chatgpt/history-diagnostic.js';
import { ChatGptSessionProbe } from '../adapters/chatgpt/session-probe.js';
import { PlaywrightBrowserAdapter } from '../adapters/playwright/playwright-browser.js';
import { WebAutomationError } from '../domain/errors.js';
import { BrowserSessionManager } from '../session/browser-session.js';

interface CliOptions {
  readonly profileId: string;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const sessions = new BrowserSessionManager(new PlaywrightBrowserAdapter(), undefined, undefined, {
    headless: false,
  });
  const session = await sessions.acquire('chatgpt', options.profileId);

  try {
    await new ChatGptConversationNavigator(session.page).open();
    const sessionStatus = await new ChatGptSessionProbe(session.page).check();
    const history = await new ChatGptHistoryDiagnostic(session.page).inspect();

    console.log(
      JSON.stringify(
        {
          profileId: options.profileId,
          sessionStatus,
          ...history,
        },
        null,
        2,
      ),
    );
  } finally {
    await session.close();
  }
}

function parseArguments(args: readonly string[]): CliOptions {
  let profileId = 'default';

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case '--profile':
        profileId = requireValue(args, ++index, '--profile');
        break;
      case '--help':
        printHelp();
        process.exit(0);
      default:
        throw new WebAutomationError('INVALID_REQUEST', `Unknown history diagnostic argument: ${argument}`);
    }
  }

  return { profileId };
}

function requireValue(args: readonly string[], index: number, name: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${name} requires a value.`);
  }
  return value;
}

function printHelp(): void {
  console.log(`Usage: npm run diagnose:history -- [options]\n\nOptions:\n  --profile <id>  Browser profile id (default: default)\n  --help          Show this help\n\nThis is a read-only diagnostic. It opens ChatGPT but sends no prompts and performs no deletes.\nIt reports only safe structural metrics: session status, provider page health, history locator presence,\nand aggregate href-shape counts. It never prints titles, conversation IDs, response bodies, or raw hrefs.\n`);
}

main().catch((error: unknown) => {
  if (error instanceof WebAutomationError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error('INTERNAL_ERROR: history diagnostic failed unexpectedly');
  }
  process.exitCode = 1;
});
