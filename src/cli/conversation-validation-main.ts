import { WebAutomationError } from '../domain/errors.js';
import { RestrictedAtomicAnswerFileWriter } from '../infrastructure/answer-file.js';
import { createDefaultAutomationApplication } from '../runtime/create-default-application.js';
import { resolveWorkspacePaths } from '../runtime/workspace-paths.js';
import { runConversationAcceptance } from '../validation/conversation-acceptance.js';

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
  const report = await runConversationAcceptance(application, options);

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
        conclusive: report.conclusive,
        discovery: report.discovery,
        reading: report.reading,
        continuation: report.continuation,
        export: report.export,
        createdConversationIds: report.createdConversationIds,
        ...(report.reason === undefined ? {} : { reason: report.reason }),
        ...(report.errorCode === undefined ? {} : { errorCode: report.errorCode }),
        reportPath: saved.filePath,
      },
      null,
      2,
    ),
  );

  process.exitCode = report.passed ? 0 : report.conclusive ? 1 : 2;
}

function parseArguments(args: readonly string[]): CliOptions {
  let profileId = 'default';
  let reportPath = defaultReportPath();
  let pageSize = 5;
  let maxPages = 5;

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
        throw new WebAutomationError('INVALID_REQUEST', `Unknown validation argument: ${argument}`);
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
  return `validation/conversation-acceptance-${new Date().toISOString().replaceAll(':', '-')}.json`;
}

function printHelp(): void {
  console.log(`Usage: npm run validate:conversations -- [options]\n\nOptions:\n  --profile <id>       Browser profile id (default: default)\n  --report <relative>  Report path under the effective output root\n  --page-size <count>  Conversations per page (default: 5, maximum: 50)\n  --max-pages <count>  Maximum pages to inspect (default: 5)\n  --help               Show this help\n\nValidation flow:\n  create disposable seed conversation\n  -> discover it through paginated conversation listing\n  -> read the full semantic transcript and verify the seed assistant marker\n  -> exercise at least a second cursor page when available\n  -> continue the same explicit conversationId\n  -> read the transcript again and prove it extended with the continuation marker\n  -> export the complete transcript to a restricted workspace file and verify export metadata\n  -> reopen and verify the last response\n\nExit codes:\n  0  Acceptance passed\n  1  Acceptance conclusively failed\n  2  Acceptance was inconclusive (for example, there were not enough conversations to exercise pagination)\n`);
}

main().catch((error: unknown) => {
  if (error instanceof WebAutomationError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error('INTERNAL_ERROR: conversation acceptance failed unexpectedly');
  }
  process.exitCode = 1;
});
