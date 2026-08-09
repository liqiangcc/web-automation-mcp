import { WebAutomationError } from '../domain/errors.js';
import { RestrictedAtomicAnswerFileWriter } from '../infrastructure/answer-file.js';
import { createDefaultAutomationApplication } from '../runtime/create-default-application.js';
import { resolveWorkspacePaths } from '../runtime/workspace-paths.js';
import { runCompletionAcceptance } from '../validation/completion-acceptance.js';

interface CliOptions {
  readonly profileId: string;
  readonly reportPath: string;
  readonly fastRuns: number;
  readonly maxFastLatencyMs: number;
  readonly longMinimumCompletionWaitMs: number;
  readonly skipLong: boolean;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const workspace = resolveWorkspacePaths(process.cwd(), process.env);
  const application = createDefaultAutomationApplication();
  const report = await runCompletionAcceptance(application, options);

  const writer = new RestrictedAtomicAnswerFileWriter(workspace.outputRoot);
  const saved = await writer.write({
    outputPath: options.reportPath,
    content: `${JSON.stringify(report, null, 2)}\n`,
    overwrite: false,
  });

  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        conclusive: report.conclusive,
        fast: report.fast.summary,
        long: report.long,
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
  let fastRuns = 5;
  let maxFastLatencyMs = 1_000;
  let longMinimumCompletionWaitMs = 120_000;
  let skipLong = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case '--profile':
        profileId = requireValue(args, ++index, '--profile');
        break;
      case '--report':
        reportPath = requireValue(args, ++index, '--report');
        break;
      case '--fast-runs':
        fastRuns = positiveInteger(requireValue(args, ++index, '--fast-runs'), '--fast-runs');
        break;
      case '--max-fast-latency-ms':
        maxFastLatencyMs = positiveNumber(
          requireValue(args, ++index, '--max-fast-latency-ms'),
          '--max-fast-latency-ms',
        );
        break;
      case '--long-min-ms':
        longMinimumCompletionWaitMs = positiveNumber(
          requireValue(args, ++index, '--long-min-ms'),
          '--long-min-ms',
        );
        break;
      case '--skip-long':
        skipLong = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
      default:
        throw new WebAutomationError('INVALID_REQUEST', `Unknown validation argument: ${argument}`);
    }
  }

  return {
    profileId,
    reportPath,
    fastRuns,
    maxFastLatencyMs,
    longMinimumCompletionWaitMs,
    skipLong,
  };
}

function requireValue(args: readonly string[], index: number, name: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${name} requires a value.`);
  }
  return value;
}

function positiveNumber(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${name} must be a positive number.`);
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
  return `validation/completion-acceptance-${new Date().toISOString().replaceAll(':', '-')}.json`;
}

function printHelp(): void {
  console.log(`Usage: npm run validate:completion -- [options]\n\nOptions:\n  --profile <id>                 Browser profile id (default: default)\n  --report <relative>            Report path under the effective output root\n  --fast-runs <count>            Number of fast-path samples (default: 5)\n  --max-fast-latency-ms <ms>     Fast-path latency target (default: 1000)\n  --long-min-ms <ms>             Required long-response completion wait (default: 120000)\n  --skip-long                    Validate only fast-path completion latency\n  --help                         Show this help\n\nExit codes:\n  0  Acceptance passed\n  1  Acceptance conclusively failed\n  2  Acceptance was inconclusive (for example, the long response finished before two minutes)\n`);
}

main().catch((error: unknown) => {
  if (error instanceof WebAutomationError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error('INTERNAL_ERROR: completion acceptance failed unexpectedly');
  }
  process.exitCode = 1;
});
