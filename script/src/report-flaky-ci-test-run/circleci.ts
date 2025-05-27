import { getJson } from './https';

export interface Pipeline {
  id: string;
  errors: Array<{ type: string; message: string }>;
  project_slug: string;
  updated_at: string;
  number: number;
  state: string;
  created_at: string;
  trigger: {
    received_at: string;
    type: string;
    actor: {
      login: string;
      avatar_url: string;
    };
  };
  vcs: {
    origin_repository_url: string;
    target_repository_url: string;
    review_url: string;
    revision: string;
    review_id: string;
    provider_name: string;
    commit: {
      body: string;
      subject: string;
    };
    branch: string;
  };
}

export interface Workflow {
  pipeline_id: string;
  canceled_by: string;
  id: string;
  name: string;
  project_slug: string;
  errored_by: string;
  tag: string;
  status: string;
  started_by: string;
  pipeline_number: number;
  created_at: string;
  stopped_at: string;
}

export interface Job {
  canceled_by: string;
  dependencies: string[];
  job_number: number;
  id: string;
  started_at: string;
  name: string;
  approved_by: string;
  project_slug: string;
  status: string;
  type: string;
  requires: Record<string, string[]>;
  stopped_at: string;
  approval_request_id: string;
}

export interface Paginated<T> {
  /** Page of items from the request. */
  items: T[];

  /** Pass as `page-token` query parameter to next request. */
  next_page_token: string | null;
}

export async function getAllPipelines(
  projectSlug: string,
  branch?: string,
  pageToken?: string
): Promise<Paginated<Pipeline>> {
  const url = new URL(
    `https://circleci.com/api/v2/project/${projectSlug}/pipeline`
  );
  if (branch) {
    url.searchParams.append('branch', branch);
  }
  if (pageToken) {
    url.searchParams.append('page-token', pageToken);
  }
  return (await getJson(url.toString())) as Paginated<Pipeline>;
}

export async function getPipelineWorkflows(
  pipelineId: string,
  pageToken?: string
): Promise<Paginated<Workflow>> {
  const url = new URL(
    `https://circleci.com/api/v2/pipeline/${pipelineId}/workflow`
  );
  if (pageToken) {
    url.searchParams.append('page-token', pageToken);
  }
  return (await getJson(url.toString())) as Paginated<Workflow>;
}

export async function getWorkflowJobs(
  workflowId: string,
  pageToken?: string
): Promise<Paginated<Job>> {
  const url = new URL(`https://circleci.com/api/v2/workflow/${workflowId}/job`);
  if (pageToken) {
    url.searchParams.append('page-token', pageToken);
  }
  return (await getJson(url.toString())) as Paginated<Job>;
}

export function getWorkflowPageUrl(
  projectSlug: string,
  pipelineNumber: number,
  workflowId: string
): string {
  return `https://app.circleci.com/pipelines/${projectSlug}/${pipelineNumber}/workflows/${workflowId}`;
}

export function getJobPageUrl(
  projectSlug: string,
  pipelineNumber: number,
  workflowId: string,
  jobNumber: number
): string {
  return `${getWorkflowPageUrl(
    projectSlug,
    pipelineNumber,
    workflowId
  )}/jobs/${jobNumber}`;
}
