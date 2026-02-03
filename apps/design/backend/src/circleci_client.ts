import {
  circleCiApiToken,
  circleCiBaseUrl,
  circleCiBranch,
  circleCiProjectSlug,
  isCircleCiEnabled,
} from './globals';
import { rootDebug } from './debug';

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
  private readonly apiToken: string;
  private readonly projectSlug: string;

  constructor(apiToken?: string, projectSlug?: string) {
    this.apiToken = apiToken ?? circleCiApiToken() ?? '';
    this.projectSlug = projectSlug ?? circleCiProjectSlug() ?? '';

    if (!this.apiToken || !this.projectSlug) {
      debug('CircleCI client initialized but not configured: hasToken=%s, hasProjectSlug=%s',
        !!this.apiToken,
        !!this.projectSlug
      );
    }
  }

  /**
   * Check if the CircleCI client is properly configured.
   */
  isConfigured(): boolean {
    return !!this.apiToken && !!this.projectSlug;
  }

  /**
   * Trigger a CircleCI pipeline for QA.
   *
   * @throws Error if CircleCI is not configured or the API request fails
   */
  async triggerPipeline(
    params: TriggerPipelineParams
  ): Promise<TriggerPipelineResponse> {
    if (!this.isConfigured()) {
      throw new Error(
        'CircleCI client is not configured. Set CIRCLECI_API_TOKEN and CIRCLECI_PROJECT_SLUG environment variables.'
      );
    }

    const { exportPackageUrl, webhookUrl, qaRunId, electionId } = params;

    debug('Triggering CircleCI pipeline for QA: projectSlug=%s, qaRunId=%s, electionId=%s',
      this.projectSlug,
      qaRunId,
      electionId
    );

    const url = `${circleCiBaseUrl()}/api/v2/project/${this.projectSlug}/pipeline`;

    try {
      const body = JSON.stringify({
        ...(circleCiBranch() ? { branch: circleCiBranch() } : {}),
        parameters: {
          export_package_url: exportPackageUrl,
          webhook_url: webhookUrl,
          qa_run_id: qaRunId,
          election_id: electionId,
        },
      });
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Circle-Token': this.apiToken,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        debug('CircleCI API request failed: status=%s, statusText=%s, error=%s, qaRunId=%s',
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

      debug('CircleCI pipeline triggered successfully: pipelineId=%s, pipelineNumber=%s, qaRunId=%s, request body=%s',
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
      debug('Error triggering CircleCI pipeline: error=%s, qaRunId=%s',
        error instanceof Error ? error.message : String(error),
        qaRunId
      );
      throw error;
    }
  }
}

/**
 * Create a CircleCI client instance.
 */
/* istanbul ignore next - @preserve */
export function createCircleCiClient(): CircleCiClient {
  return new CircleCiClient();
}

/**
 * Check if CircleCI integration is enabled and configured.
 */
/* istanbul ignore next - @preserve */
export function shouldTriggerCircleCi(): boolean {
  return isCircleCiEnabled();
}
