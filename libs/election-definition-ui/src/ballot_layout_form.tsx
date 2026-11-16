import { Button, RadioGroup, Callout } from '@votingworks/ui';
import { HmpbBallotPaperSize, type ElectionId } from '@votingworks/types';
import type { BallotLayoutSettings } from '@votingworks/election-definition-backend';
import { useState } from 'react';
import styled from 'styled-components';
import { useElectionDefinitionApi } from './election_definition_context.js';
import { Row } from './layout.js';

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const FormActionsRow = styled(Row)`
  gap: 0.5rem;

  button {
    min-width: 8rem;
  }
`;

export const paperSizeLabels: Record<HmpbBallotPaperSize, string> = {
  [HmpbBallotPaperSize.Letter]: '8.5 x 11 inches (Letter)',
  [HmpbBallotPaperSize.Legal]: '8.5 x 14 inches (Legal)',
  [HmpbBallotPaperSize.Custom17]: '8.5 x 17 inches',
  [HmpbBallotPaperSize.Custom18]: '8.5 x 18 inches',
  [HmpbBallotPaperSize.Custom19]: '8.5 x 19 inches',
  [HmpbBallotPaperSize.Custom20]: '8.5 x 20 inches',
  [HmpbBallotPaperSize.Custom22]: '8.5 x 22 inches',
};

export interface BallotLayoutFormProps {
  electionId: ElectionId;
  isLocked?: boolean;
  hideDensity?: boolean;
}

export function BallotLayoutForm({
  electionId,
  isLocked,
  hideDensity,
}: BallotLayoutFormProps): JSX.Element | null {
  const api = useElectionDefinitionApi();
  const getBallotLayoutSettingsQuery =
    api.getBallotLayoutSettings.useQuery(electionId);
  const getStateFeaturesQuery = api.getStateFeatures.useQuery(electionId);

  if (
    !(getBallotLayoutSettingsQuery.isSuccess && getStateFeaturesQuery.isSuccess)
  ) {
    return null;
  }

  return (
    <LayoutSettingsForm
      electionId={electionId}
      savedLayoutSettings={getBallotLayoutSettingsQuery.data}
      onlyLetterAndLegal={
        !!getStateFeaturesQuery.data.ONLY_LETTER_AND_LEGAL_PAPER_SIZES
      }
      isLocked={isLocked}
      hideDensity={hideDensity}
    />
  );
}

function LayoutSettingsForm({
  electionId,
  savedLayoutSettings,
  onlyLetterAndLegal,
  isLocked,
  hideDensity,
}: {
  electionId: ElectionId;
  savedLayoutSettings: BallotLayoutSettings;
  onlyLetterAndLegal: boolean;
  isLocked?: boolean;
  hideDensity?: boolean;
}): JSX.Element {
  const api = useElectionDefinitionApi();
  const [isEditing, setIsEditing] = useState(false);
  const [layoutSettings, setLayoutSettings] = useState(savedLayoutSettings);
  const updateBallotLayoutSettingsMutation =
    api.updateBallotLayoutSettings.useMutation();

  function onSubmit() {
    updateBallotLayoutSettingsMutation.mutate(
      { electionId, ...layoutSettings },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        setLayoutSettings(savedLayoutSettings);
        setIsEditing(false);
      }}
    >
      <div style={{ maxWidth: '16.5rem' }}>
        <RadioGroup
          label="Paper Size"
          options={Object.entries(paperSizeLabels)
            .filter(([value]) =>
              onlyLetterAndLegal
                ? value === HmpbBallotPaperSize.Letter ||
                  value === HmpbBallotPaperSize.Legal
                : true
            )
            .map(([value, label]) => ({
              value,
              label,
            }))}
          value={layoutSettings.paperSize}
          onChange={(value) =>
            setLayoutSettings({
              ...layoutSettings,
              paperSize: value as HmpbBallotPaperSize,
            })
          }
          disabled={!isEditing}
        />
      </div>
      {!hideDensity && (
        <div style={{ maxWidth: '16.5rem' }}>
          <RadioGroup
            label="Density"
            options={[
              {
                label: 'Default',
                value: 'default',
              },
              {
                label: 'Compact',
                value: 'compact',
              },
            ]}
            value={layoutSettings.compact ? 'compact' : 'default'}
            onChange={(value) =>
              setLayoutSettings({
                ...layoutSettings,
                compact: value === 'compact',
              })
            }
            disabled={!isEditing}
          />
        </div>
      )}
      {isEditing ? (
        <FormActionsRow>
          <Button type="reset">Cancel</Button>
          <Button type="submit" variant="primary" icon="Done">
            Save
          </Button>
        </FormActionsRow>
      ) : (
        <FormActionsRow>
          <Button
            key="edit"
            variant="primary"
            icon="Edit"
            disabled={isLocked}
            onPress={() => setIsEditing(true)}
          >
            Edit
          </Button>
        </FormActionsRow>
      )}
      {onlyLetterAndLegal && (
        <Callout
          style={{ alignSelf: 'flex-start' }}
          icon="Info"
          color="neutral"
        >
          Reach out to VotingWorks support if you would prefer a longer paper
          size.
        </Callout>
      )}
    </Form>
  );
}
