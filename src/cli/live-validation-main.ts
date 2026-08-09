import { createHash } from 'node:crypto';

import { WebAutomationError } from '../domain/errors.js';
import { RestrictedAtomicAnswerFileWriter } from '../infrastructure/answer-file.js';
import { createDefaultAutomationApplication } from '../runtime/create-default-application.js';
import { resolveWorkspacePaths } from '../runtime/workspace-paths.js';
import {
  runAttachmentValidation,
  runLiveValidation,
  type AttachmentValidationSpec,
} from '../validation/live-validation.js';

interface CliOptions {
  readonly profileId: string;
  readonly reportPath: string;
  readonly delayMs: number;
  readonly skipAttachments: boolean;
  readonly workspaceOnly: boolean;
  readonly binaryFile?: string;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const workspace = resolveWorkspacePaths(process.cwd(), process.env);
  const workspaceFingerprint = createHash('sha256').update(workspace.workspaceRoot).digest('hex');

  if (options.workspaceOnly) {
    console.log(
      JSON.stringify(
        {
          workspaceFingerprint,
          workspaceConfigured: Boolean(process.env.WEB_AUTOMATION_MCP_WORKSPACE?.trim()),
          inputRootOverridden: Boolean(process.env.WEB_AUTOMATION_MCP_INPUT_ROOT?.trim()),
          outputRootOverridden: Boolean(process.env.WEB_AUTOMATION_MCP_OUTPUT_ROOT?.trim()),
        },
        null,
        2,
      ),
    );
    return;
  }

  const application = createDefaultAutomationApplication();
  const reliability = await runLiveValidation(application, {
    profileId: options.profileId,
    delayMs: options.delayMs,
  });

  const attachmentSpecs = options.skipAttachments ? [] : defaultAttachmentSpecs(options.binaryFile);
  const attachments = await runAttachmentValidation(
    application,
    options.profileId,
    attachmentSpecs,
  );

  const report = {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    mode:
      process.env.WEB_AUTOMATION_MCP_CDP_URL === undefined
        ? ('persistent_profile' as const)
        : ('shared_cdp' as const),
    workspaceFingerprint,
    workspaceConfigured: Boolean(process.env.WEB_AUTOMATION_MCP_WORKSPACE?.trim()),
    inputRootOverridden: Boolean(process.env.WEB_AUTOMATION_MCP_INPUT_ROOT?.trim()),
    outputRootOverridden: Boolean(process.env.WEB_AUTOMATION_MCP_OUTPUT_ROOT?.trim()),
    reliability,
    attachments,
  };

  const writer = new RestrictedAtomicAnswerFileWriter(workspace.outputRoot);
  const saved = await writer.write({
    outputPath: options.reportPath,
    content: `${JSON.stringify(report, null, 2)}\n`,
    overwrite: false,
  });

  const attachmentPassed = attachments.every((result) => result.status === 'SUCCESS');
  const passed = reliability.summary.passed && attachmentPassed;
  console.log(
    JSON.stringify(
      {
        passed,
        reliability: reliability.summary,
        attachments,
        reportPath: saved.filePath,
        workspaceFingerprint: report.workspaceFingerprint,
        mode: report.mode,
      },
      null,
      2,
    ),
  );
  process.exitCode = passed ? 0 : 1;
}

function defaultAttachmentSpecs(binaryFile: string | undefined): readonly AttachmentValidationSpec[] {
  const specs: AttachmentValidationSpec[] = [
    {
      id: 'text_file',
      files: ['validation/fixtures/sample.txt'],
      prompt:
        'Read the attached text file and output the validation token exactly once before the required end marker.',
      expectedText: ['ALPHA-7429'],
    },
    {
      id: 'multiple_files',
      files: ['validation/fixtures/sample.txt', 'validation/fixtures/sample.md'],
      prompt:
        'Read both attached files and output both validation tokens exactly once before the required end marker.',
      expectedText: ['ALPHA-7429', 'BETA-3141'],
    },
  ];

  if (binaryFile !== undefined) {
    specs.push({
      id: 'binary_file',
      files: [binaryFile],
      prompt:
        'Confirm that you can access the attached PDF or image, describe it briefly, and then emit the required end marker.',
    });
  }

  return specs;
}

function parseArguments(args: readonly string[]): CliOptions {
  let profileId = 'default';
  let reportPath = defaultReportPath();
  let delayMs = 1_000;
  let skipAttachments = false;
  let workspaceOnly = false;
  let binaryFile: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case '--profile':
        profileId = requireValue(args, ++index, '--profile');
        break;
      case '--report':
        reportPath = requireValue(args, ++index, '--report');
        break;
      case '--delay-ms': {
        const raw = requireValue(args, ++index, '--delay-ms');
        delayMs = Number(raw);
        if (!Number.isFinite(delayMs) || delayMs < 0) {
          throw new WebAutomationError('INVALID_REQUEST', '--delay-ms must be a non-negative number.');
        }
        break;
      }
      case '--skip-attachments':
        skipAttachments = true;
        break;
      case '--workspace-only':
        workspaceOnly = true;
        break;
      case '--binary-file':
        binaryFile = requireValue(args, ++index, '--binary-file');
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
    delayMs,
    skipAttachments,
    workspaceOnly,
    ...(binaryFile === undefined ? {} : { binaryFile }),
  };
}

function requireValue(args: readonly string[], index: number, name: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${name} requires a value.`);
  }
  return value;
}

function defaultReportPath(): string {
  return `validation/live-validation-${new Date().toISOString().replaceAll(':', '-')}.json`;
}

function printHelp(): void {
  console.log(`Usage: npm run validate:live -- [options]\n\nOptions:\n  --profile <id>          Browser profile id (default: default)\n  --report <relative>     Report path under the effective output root\n  --delay-ms <ms>         Delay between the 30 reliability requests (default: 1000)\n  --skip-attachments      Run only the 30-request reliability matrix\n  --workspace-only        Print the workspace fingerprint without opening a browser\n  --binary-file <path>    Add one workspace-relative PDF/image attachment check\n  --help                  Show this help\n`);
}

main().catch((error: unknown) => {
  if (error instanceof WebAutomationError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error('INTERNAL_ERROR: live validation failed unexpectedly');
  }
  process.exitCode = 1;
});
