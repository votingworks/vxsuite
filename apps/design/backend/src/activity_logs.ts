import * as Sentry from '@sentry/node';
import { format } from '@votingworks/utils';

import { baseUrl, slackWebhookUrl } from './globals';
import { Store } from './store';
import { User, UserType } from './types';

interface UserContext {
  userName: string;
  userType: UserType;
}

interface ElectionContext {
  electionId: string;
}

interface FinalizeBallot extends UserContext, ElectionContext {
  type: 'finalize_ballot';
}

interface UnfinalizeBallot extends UserContext, ElectionContext {
  type: 'unfinalize_ballot';
  reason: string;
}

interface ApproveBallot extends UserContext, ElectionContext {
  type: 'approve_ballot';
}

type Activity = FinalizeBallot | UnfinalizeBallot | ApproveBallot;
type ActivityType = Activity['type'];

const ACTIVITY_TYPE_TO_MESSAGE: Record<ActivityType, string> = {
  finalize_ballot: ':mag: Ballot finalized and ready for review',
  unfinalize_ballot: ':rewind: Ballot unfinalized',
  approve_ballot: ':white_check_mark: Ballot approved and ready for use',
};

const READABLE_USER_TYPES: Record<User['type'], string> = {
  jurisdiction_user: 'Jurisdiction user',
  organization_user: 'Organization user',
  support_user: 'Support user',
};

function markdown(text: string) {
  return { type: 'mrkdwn', text };
}

export async function logActivity(
  store: Store,
  activity: Activity
): Promise<void> {
  const { type, userName, userType, electionId } = activity;
  const { election } = await store.getElection(electionId);
  const jurisdiction = await store.getElectionJurisdiction(electionId);

  const message = ACTIVITY_TYPE_TO_MESSAGE[type];
  const userString = `${READABLE_USER_TYPES[userType]} ${userName}`;
  const electionString = `${election.title} · ${format.localeDate(
    election.date.toMidnightDatetimeWithSystemTimezone()
  )}`;
  const electionUrl = `${baseUrl()}/elections/${election.id}`;

  const contextElements = [
    markdown(`:round_pushpin: ${jurisdiction.name}`),
    markdown(`:ballot_box_with_ballot: <${electionUrl}|${electionString}>`),
    markdown(`:technologist: ${userString}`),
  ];
  if (type === 'unfinalize_ballot') {
    contextElements.push(markdown(`:memo: Reason: ${activity.reason}`));
  }

  const formattedMessage = {
    text: message,
    blocks: [
      { type: 'section', text: markdown(`*${message}*`) },
      {
        type: 'context',
        elements: contextElements,
      },
    ],
  } as const;

  // Don't block on the request to the Slack webhook
  void logToSlack(JSON.stringify(formattedMessage));
}

async function logToSlack(message: string): Promise<void> {
  /* istanbul ignore next - @preserve */
  if (slackWebhookUrl()) {
    try {
      await fetch(slackWebhookUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: message,
      });
    } catch (error) {
      Sentry.captureException(error);
      // eslint-disable-next-line no-console
      console.error('Error logging to Slack:', error, message);
    }
  }
}
