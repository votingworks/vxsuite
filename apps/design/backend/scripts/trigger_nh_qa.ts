import { sleep } from '@votingworks/basics';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { CircleCiClient } from '../src/circleci_client';
import { S3FileStorageClient } from '../src/file_storage_client';

// The internal vx-qa pipeline used for QA of customer elections. VxDesign
// triggers this same project in production.
const DEFAULT_PROJECT_SLUG = 'gh/votingworks/vx-qa-internal';

// vx-qa downloads the package before the QA workflow starts, but the pipeline
// can sit in the CircleCI queue first. Give the presigned URL a generous life.
const PRESIGN_EXPIRY_SECONDS = 12 * 60 * 60;

// S3 key prefix for staged QA packages.
const KEY_PREFIX = 'nh-qa';

const CIRCLECI_API = 'https://circleci.com/api/v2';
const POLL_INTERVAL_MS = 15_000;

// Terminal CircleCI workflow statuses (anything else means still running).
const TERMINAL_WORKFLOW_STATUSES = new Set([
  'success',
  'failed',
  'error',
  'canceled',
  'unauthorized',
]);

interface Args {
  zipPath: string;
  projectSlug: string;
  wait: boolean;
}

function parseArgs(argv: readonly string[]): Args | undefined {
  const positionals: string[] = [];
  let projectSlug = DEFAULT_PROJECT_SLUG;
  let wait = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--wait') {
      wait = true;
    } else if (arg === '--slug') {
      i += 1;
      projectSlug = argv[i];
    } else if (arg.startsWith('--')) {
      console.error(`Unknown flag: ${arg}`);
      return undefined;
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    return undefined;
  }
  return { zipPath: positionals[0], projectSlug, wait };
}

async function circleCiGet(
  path: string,
  token: string
): Promise<Record<string, unknown>> {
  const response = await fetch(`${CIRCLECI_API}${path}`, {
    headers: { 'Circle-Token': token, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(
      `CircleCI GET ${path} failed: ${response.status} ${response.statusText}`
    );
  }
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Upload the election package to S3 and return a presigned download URL that
 * the vx-qa CI container can fetch without any AWS credentials.
 */
async function uploadPackage(zipPath: string): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket || !process.env.AWS_S3_REGION) {
    throw new Error(
      'AWS_S3_BUCKET_NAME and AWS_S3_REGION must be set (plus AWS credentials in the environment) to upload the package.'
    );
  }
  const contents = await readFile(zipPath);
  const key = `${KEY_PREFIX}/${randomUUID()}/${basename(zipPath)}`;
  const client = new S3FileStorageClient();
  (await client.writeFile(key, contents)).unsafeUnwrap();
  console.log(`Uploaded ${basename(zipPath)} to s3://${bucket}/${key}`);
  return client.getSignedUrl(key, PRESIGN_EXPIRY_SECONDS);
}

/**
 * Poll the pipeline's workflow until it reaches a terminal state, printing
 * status transitions, then print the job web URLs.
 */
async function waitForResult(
  pipelineId: string,
  projectSlug: string,
  token: string
): Promise<boolean> {
  let lastStatus = '';
  for (;;) {
    const workflows = ((
      await circleCiGet(`/pipeline/${pipelineId}/workflow`, token)
    ).items ?? []) as Array<{ id: string; name: string; status: string }>;
    const workflow = workflows[0];
    if (!workflow) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (workflow.status !== lastStatus) {
      console.log(`  workflow ${workflow.name}: ${workflow.status}`);
      lastStatus = workflow.status;
    }
    if (TERMINAL_WORKFLOW_STATUSES.has(workflow.status)) {
      const jobs = ((await circleCiGet(`/workflow/${workflow.id}/job`, token))
        .items ?? []) as Array<{
        job_number?: number;
        name: string;
        status: string;
      }>;
      for (const job of jobs) {
        const jobUrl = job.job_number
          ? `https://app.circleci.com/pipelines/${projectSlug}/jobs/${job.job_number}`
          : '(not started)';
        console.log(`  job ${job.name}: ${job.status} — ${jobUrl}`);
      }
      return workflow.status === 'success';
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

const USAGE = `Usage: trigger_nh_qa <election-package.zip> [--wait] [--slug <gh/org/repo>]

Uploads a generated NH election package to S3 and triggers the vx-qa CI
pipeline to QA it against the deployed vxsuite version. Run this on the output
of render_nh_election_package.

Env: AWS_S3_BUCKET_NAME, AWS_S3_REGION, AWS credentials, CIRCLECI_API_TOKEN.`;

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args) {
    console.error(USAGE);
    return 1;
  }

  const token = process.env.CIRCLECI_API_TOKEN;
  if (!token) {
    console.error('CIRCLECI_API_TOKEN must be set (VxQA Admin API token).');
    return 1;
  }

  const exportPackageUrl = await uploadPackage(args.zipPath);

  // Label the run by the town directory the package lives in.
  const electionId = basename(dirname(args.zipPath));
  const qaRunId = randomUUID();
  const circleCi = new CircleCiClient(token, args.projectSlug);
  const result = await circleCi.triggerPipeline({
    exportPackageUrl,
    // No webhook receiver: vx-qa treats the callback as best-effort, so results
    // are read from the CircleCI job below instead.
    webhookUrl: '',
    qaRunId,
    electionId,
  });

  const pipelineUrl = `https://app.circleci.com/pipelines/${args.projectSlug}/${result.pipelineNumber}`;
  console.log(
    `Triggered vx-qa pipeline ${result.pipelineNumber}: ${pipelineUrl}`
  );

  if (!args.wait) {
    return 0;
  }

  console.log('Waiting for QA workflow to finish...');
  const passed = await waitForResult(
    result.pipelineId,
    args.projectSlug,
    token
  );
  console.log(passed ? 'QA PASSED ✓' : 'QA FAILED ✗');
  return passed ? 0 : 1;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
