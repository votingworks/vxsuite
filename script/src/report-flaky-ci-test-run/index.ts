import assert from 'node:assert';
import { IO } from '../types';
import {
  getAllPipelines,
  getJobPageUrl,
  getPipelineWorkflows,
  getWorkflowJobs,
  getWorkflowPageUrl,
} from './circleci';
import { post } from './https';

export async function main({ stdout }: IO) {
  const {
    CIRCLE_BRANCH,
    CIRCLE_PROJECT_REPONAME,
    CIRCLE_PROJECT_USERNAME,
    CIRCLE_SHA1,
    CI_PULL_REQUEST,
    SLACK_FLAKY_TEST_WEBHOOK,
  } = process.env;

  const projectSlug = `gh/${CIRCLE_PROJECT_USERNAME}/${CIRCLE_PROJECT_REPONAME}`;
  const pipelineResponse = await getAllPipelines(projectSlug, CIRCLE_BRANCH);

  const pipelinesForThisCommit = pipelineResponse.items.filter(
    (p) => p.vcs.revision === CIRCLE_SHA1
  );

  for (const pipeline of pipelinesForThisCommit) {
    const workflowResponse = await getPipelineWorkflows(pipeline.id);
    const failedWorkflow = workflowResponse.items.find(
      (w) => w.status === 'failed'
    );

    if (failedWorkflow) {
      const jobResponse = await getWorkflowJobs(failedWorkflow.id);
      const failedJobs = jobResponse.items.filter((j) => j.status === 'failed');
      const workflowPageUrl = getWorkflowPageUrl(
        projectSlug,
        pipeline.number,
        failedWorkflow.id
      );
      stdout.write(`Found failed workflow: ${workflowPageUrl}\n`);
      for (const failedJob of failedJobs) {
        stdout.write(
          `- ${getJobPageUrl(
            projectSlug,
            pipeline.number,
            failedWorkflow.id,
            failedJob.job_number
          )}\n`
        );
      }

      if (SLACK_FLAKY_TEST_WEBHOOK) {
        const pullRequestUrl = CI_PULL_REQUEST
          ? new URL(CI_PULL_REQUEST)
          : undefined;
        const pullRequstNumber = pullRequestUrl?.pathname?.split('/').pop();
        const response = await post(
          SLACK_FLAKY_TEST_WEBHOOK,
          {
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: [
                    '*:croissant::croissant::croissant: Flaky test! :croissant::croissant::croissant:*',
                    `*Branch:* \`${pipeline.vcs.branch}\``,
                    `*From:* \`${pipeline.trigger.actor.login}\``,
                    ...(pullRequestUrl && pullRequstNumber
                      ? [`*PR*: <${pullRequestUrl}|#${pullRequstNumber}>`]
                      : []),
                    `*Workflow:* <${workflowPageUrl}|${failedWorkflow.name}>`,
                    `*Failed Jobs:*`,
                  ].join('\n'),
                },
                accessory: {
                  type: 'image',
                  image_url: pipeline.trigger.actor.avatar_url,
                  alt_text: pipeline.trigger.actor.login,
                },
              },
            ],
            attachments: [
              {
                blocks: [
                  ...failedJobs.map((j) => ({
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `:link: <${getJobPageUrl(
                        projectSlug,
                        pipeline.number,
                        failedWorkflow.id,
                        j.job_number
                      )}|\`${j.name}\`>`,
                    },
                  })),
                ],
              },
            ],
          },
          { headers: { 'content-type': 'application/json' } }
        );

        assert(
          typeof response === 'string',
          `Expected string but got ${JSON.stringify(response)}`
        );
        assert(
          response === 'ok',
          `Unexpected response from Slack: ${response}`
        );
      }
    }
  }
}
