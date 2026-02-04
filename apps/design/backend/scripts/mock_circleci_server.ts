/**
 * Mock CircleCI server for testing the QA integration.
 *
 * This server:
 * 1. Receives pipeline trigger requests from VxDesign
 * 2. Responds with a mock pipeline ID
 * 3. Sends a series of webhook callbacks mimicking real vx-qa status updates
 *
 * Usage:
 *   pnpm mock-circleci-server [-- options]
 *
 * Options:
 *   --port <port>           Port to listen on (default: 9000)
 *   --delay <ms>            Delay between status updates in ms (default: 3000)
 *   --webhook-secret <s>    Secret for webhook callbacks (default: test-secret)
 *   --fail                  Simulate a failure instead of success
 */

import { safeParseNumber } from '@votingworks/types';
import http from 'node:http';

const STATUS_MESSAGES: Array<{ status: string; statusMessage: string }> = [
  { status: 'in_progress', statusMessage: 'QA automation starting' },
  {
    status: 'in_progress',
    statusMessage: 'Setting up VxSuite repository',
  },
  {
    status: 'in_progress',
    statusMessage: 'Clearing previous run state',
  },
  { status: 'in_progress', statusMessage: 'Loading election package' },
  {
    status: 'in_progress',
    statusMessage: 'Preparing ballots for scanning',
  },
  {
    status: 'in_progress',
    statusMessage: 'Configuring VxAdmin with election package',
  },
  {
    status: 'in_progress',
    statusMessage: 'Scanning ballots with VxScan',
  },
  {
    status: 'in_progress',
    statusMessage: 'Importing CVRs and validating tallies',
  },
  { status: 'in_progress', statusMessage: 'Copying app workspaces' },
  { status: 'in_progress', statusMessage: 'Generating QA report' },
];

// Parse command line arguments
const args = process.argv.slice(2);
function getArg(name: string, defaultValue: string): string {
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return defaultValue;
}

const PORT = safeParseNumber(getArg('--port', '9000')).unsafeUnwrap();
const DELAY_MS = safeParseNumber(getArg('--delay', '3000')).unsafeUnwrap();
const WEBHOOK_SECRET = getArg('--webhook-secret', 'test-secret');
const SHOULD_FAIL = args.includes('--fail');

let pipelineCounter = 0;

async function sendWebhookCallback(
  webhookUrl: string,
  status: string,
  statusMessage: string,
  resultsUrl?: string
): Promise<void> {
  console.log(`  → ${status}: ${statusMessage}`);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        status,
        statusMessage,
        ...(resultsUrl ? { resultsUrl } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`    ✗ ${response.status} ${body}`);
    }
  } catch (error) {
    console.error(
      `    ✗ ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function simulatePipeline(
  webhookUrl: string,
  qaRunId: string
): Promise<void> {
  console.log(`\n[Pipeline ${qaRunId}] Starting simulation`);
  console.log(`  Webhook: ${webhookUrl}`);
  console.log(`  Delay: ${DELAY_MS}ms between updates`);
  console.log('');

  for (const step of STATUS_MESSAGES) {
    await delay(DELAY_MS);
    await sendWebhookCallback(webhookUrl, step.status, step.statusMessage);
  }

  // Final status
  await delay(DELAY_MS);
  if (SHOULD_FAIL) {
    await sendWebhookCallback(
      webhookUrl,
      'failure',
      'QA tests failed: 3 ballot validation errors found',
      'https://example.com/qa-results/failure.html'
    );
  } else {
    await sendWebhookCallback(
      webhookUrl,
      'success',
      'QA completed: 12 accepted, 4 rejected',
      'https://example.com/qa-results/success.html'
    );
  }

  console.log(`\n[Pipeline ${qaRunId}] Simulation complete`);
}

const server = http.createServer((req, res) => {
  if (
    req.method === 'POST' &&
    req.url?.match(/\/api\/v2\/project\/.*\/pipeline/)
  ) {
    let body = '';
    req.setEncoding('utf8');

    req.on('readable', () => {
      let chunk;
      // eslint-disable-next-line no-cond-assign
      while ((chunk = req.read()) !== null) {
        body += chunk;
      }
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body) as {
          parameters?: {
            export_package_url?: string;
            webhook_url?: string;
            qa_run_id?: string;
            election_id?: string;
          };
        };
        const params = data.parameters ?? {};

        console.log('\n[Request] Pipeline trigger received:');
        console.log(`  export_package_url: ${params.export_package_url}`);
        console.log(`  webhook_url: ${params.webhook_url}`);
        console.log(`  qa_run_id: ${params.qa_run_id}`);
        console.log(`  election_id: ${params.election_id}`);

        pipelineCounter += 1;
        const pipelineId = `mock-pipeline-${Date.now()}-${pipelineCounter}`;

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: pipelineId,
            number: pipelineCounter,
            state: 'pending',
            created_at: new Date().toISOString(),
          })
        );

        if (params.webhook_url) {
          void simulatePipeline(
            params.webhook_url,
            params.qa_run_id ?? 'unknown'
          );
        }
      } catch (error) {
        console.error(
          `[Error] ${error instanceof Error ? error.message : String(error)}`
        );
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  const line = '='.repeat(60);
  console.log(line);
  console.log('Mock CircleCI Server');
  console.log(line);
  console.log(`Port:           ${PORT}`);
  console.log(`Update delay:   ${DELAY_MS}ms`);
  console.log(`Webhook secret: ${WEBHOOK_SECRET}`);
  console.log(`Final status:   ${SHOULD_FAIL ? 'failure' : 'success'}`);
  console.log('');
  console.log('Start VxDesign with:');
  console.log('');
  console.log('  CIRCLECI_API_TOKEN=test-token \\');
  console.log('  CIRCLECI_PROJECT_SLUG=gh/test/repo \\');
  console.log(`  CIRCLECI_WEBHOOK_SECRET=${WEBHOOK_SECRET} \\`);
  console.log(`  CIRCLECI_BASE_URL=http://localhost:${PORT} \\`);
  console.log('  BASE_URL=http://localhost:3000 \\');
  console.log('  pnpm -C apps/design start');
  console.log('');
  console.log('Then export an election in VxDesign.');
  console.log(line);
  console.log('');
});
