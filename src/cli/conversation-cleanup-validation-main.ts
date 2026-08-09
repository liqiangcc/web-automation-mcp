import { WebAutomationError } from '../domain/errors.js';
import { RestrictedAtomicAnswerFileWriter } from '../infrastructure/answer-file.js';
import { createDefaultAutomationApplication } from '../runtime/create-default-application.js';
import { resolveWorkspacePaths } from '../runtime/workspace-paths.js';
import { runConversationCleanupAcceptance } from '../validation/conversation-cleanup-acceptance.js';

interface CliOptions {
  readonly profileId: string;
  readonly reportPath: string;
  readonly pageSize: number;
  readonly maxPages: number;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const workspace = resolveWorkspacePaths(process.cwd(), process.env);
  const application = createDefaultAutomationApplication();
  const report = await runConversationCleanupAcceptance(application, options);

  const writer = new RestrictedAtomicAnswerFileWriter(workspace.outputRoot);
  const saved = await writer.write({
    outputPath: options.reportPath,
    content: `${JSON.stringify(report, null, 2)}\n`,
    overwrite: false,
  });

  console.log(
    JSON.stringify(
      {
        status: report.status,
        passed: report.passed,
        preflight: report.preflight,
        targetDelete: report.targetDelete,
        survivor: report.survivor,
        createdConversationIds: report.createdConversationIds,
        ...(report.reason === undefined ? {} : { reason: report.reason }),
        ...(report.errorCode === undefined ? {} : { errorCode: report.errorCode }),
        reportPath: saved.filePath,
      },
      null,
      2,
    ),
  );

  process.exitCode = report.passed ? 0 : 1;
}

function parseArguments(args: readonly string[]): CliOptions {
  let profileId = 'default';
  let reportPath = defaultReportPath();
  let pageSize = 20;
  let maxPages = 3;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case '--profile':
        profileId = requireValue(args, ++index, '--profile');
        break;
      case '--report':
        reportPath = requireValue(args, ++index, '--report');
        break;
      case '--page-size':
        pageSize = positiveInteger(requireValue(args, ++index, '--page-size'), '--page-size');
        if (pageSize > 50) {
          throw new WebAutomationError('INVALID_REQUEST', '--page-size must be <= 50.');
        }
        break;
      case '--max-pages':
        maxPages = positiveInteger(requireValue(args, ++index, '--max-pages'), '--max-pages');
        break;
      case '--help':
        printHelp();
        process.exit(0);
      default:
        throw new WebAutomationError('INVALID_REQUEST', `Unknown cleanup validation argument: ${argument}`);
    }
  }

  return { profileId, reportPath, pageSize, maxPages };
}

function requireValue(args: readonly string[], index: number, name: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${name} requires a value.`);
  }
  return value;
}

function positiveInteger(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${name} must be a positive integer.`);
  }
  return value;
}

function defaultReportPath(): string {
  return `validation/conversation-cleanup-${new Date().toISOString().replaceAll(':', '-')}.json`;
}

function printHelp(): void {
  console.log(`Usage: npm run validate:cleanup -- [options]\n\nOptions:\n  --profile <id>       Browser profile id (default: default)\n  --report <relative>  Report path under the effective output root\n  --page-size <count>  Recent conversations per page (default: 20, maximum: 50)\n  --max-pages <count>  Maximum recent pages to inspect (default: 3)\n  --help               Show this help\n\nSafety flow:\n  create two disposable conversations\n  -> prove both explicit IDs are discoverable\n  -> delete only the target ID\n  -> prove target disappeared and survivor remains readable\n  -> prove repeated target deletion returns CONVERSATION_NOT_FOUND\n  -> delete the disposable survivor and confirm cleanup\n\nThis command never selects or deletes pre-existing conversations.\n`);
}

main().catch((error: unknown) => {
  if (error instanceof WebAutomationError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error('INTERNAL_ERROR: cleanup acceptance failed unexpectedly');
  }
  process.exitCode = 1;
});
