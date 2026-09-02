import { SoftwareVersion } from '@votingworks/types';
import { QaConfig } from './qa_config.js';
import { rootDebug } from './debug.js';

const debug = rootDebug.extend('circleci');

export interface TriggerPipelineParams {
  /**
   * The S3 URL of the exported election+ballots package.
   */
  exportPackageUrl: string;

  /**
   * The webhook URL to call back with status updates.
   */
  webhookUrl: string;

  /**
   * The QA run ID for tracking.
   */
  qaRunId: string;

  /**
   * The election ID being QA'd.
   */
  electionId: string;

  /**
   * The VxSuite version the election targets, so the QA run builds and tests
   * against the matching VxSuite release (e.g. 'v4.0', 'v4.1').
   */
  vxsuiteVersion: SoftwareVersion;
}

export interface TriggerPipelineResponse {
  /**
   * The CircleCI pipeline ID.
   */
  pipelineId: string;

  /**
   * The CircleCI pipeline number.
   */
  pipelineNumber: number;

  /**
   * The state of the pipeline.
   */
  state: string;

  /**
   * When the pipeline was created.
   */
  createdAt: string;
}

/**
 * Client for interacting with the CircleCI API to trigger QA builds.
 */
export class CircleCiClient {
  constructor(private readonly config: QaConfig) {}

  /**
   * Trigger a CircleCI pipeline for QA.
   *
   * @throws Error if the API request fails
   */
  async triggerPipeline(
    params: TriggerPipelineParams
  ): Promise<TriggerPipelineResponse> {
    const { apiBaseUrl, apiToken, branch, projectSlug } = this.config;
    const {
      exportPackageUrl,
      webhookUrl,
      qaRunId,
      electionId,
      vxsuiteVersion,
    } = params;

    const url = `${apiBaseUrl}/api/v2/project/${projectSlug}/pipeline`;

    debug(
      'Triggering CircleCI pipeline for QA: projectSlug=%s, qaRunId=%s, electionId=%s, url=%s',
      projectSlug,
      qaRunId,
      electionId,
      url
    );

    try {
      const body = JSON.stringify({
        ...(branch ? { branch } : {}),
        parameters: {
          export_package_url: exportPackageUrl,
          webhook_url: webhookUrl,
          qa_run_id: qaRunId,
          election_id: electionId,
          vxsuite_version: vxsuiteVersion,
        },
      });
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Circle-Token': apiToken,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        debug(
          'CircleCI API request failed: status=%s, statusText=%s, error=%s, qaRunId=%s',
          response.status,
          response.statusText,
          errorText,
          qaRunId
        );

        throw new Error(
          `CircleCI API request failed: ${response.status} ${response.statusText} - ${errorText} (request body: ${body})`
        );
      }

      const data = (await response.json()) as {
        id: string;
        number: number;
        state: string;
        created_at: string;
      };

      debug(
        'CircleCI pipeline triggered successfully: pipelineId=%s, pipelineNumber=%s, qaRunId=%s, request body=%s',
        data.id,
        data.number,
        qaRunId,
        body
      );

      return {
        pipelineId: data.id,
        pipelineNumber: data.number,
        state: data.state,
        createdAt: data.created_at,
      };
    } catch (error) {
      debug(
        'Error triggering CircleCI pipeline: error=%s, qaRunId=%s',
        // @coverage-defer
        error instanceof Error ? error.message : String(error),
        qaRunId
      );
      throw error;
    }
  }

  /**
   * The CircleCI page for a triggered pipeline, for linking users to the run.
   */
  pipelineUrl(pipelineNumber: number): string {
    return `https://app.circleci.com/pipelines/${this.config.projectSlug}/${pipelineNumber}`;
  }
}
