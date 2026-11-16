import { Button, RadioGroup, Callout } from '@votingworks/ui';
import { HmpbBallotPaperSize, type ElectionId } from '@votingworks/types';
import { useState } from 'react';
import type { BallotTemplateId } from '@votingworks/hub-backend';
import { updateBallotLayoutSettings, electionDefinitionApi } from './api.js';
import { Form, FormActionsRow } from './layout.js';

export const paperSizeLabels: Record<HmpbBallotPaperSize, string> = {
  [HmpbBallotPaperSize.Letter]: '8.5 x 11 inches (Letter)',
  [HmpbBallotPaperSize.Legal]: '8.5 x 14 inches (Legal)',
  [HmpbBallotPaperSize.Custom17]: '8.5 x 17 inches',
  [HmpbBallotPaperSize.Custom18]: '8.5 x 18 inches',
  [HmpbBallotPaperSize.Custom19]: '8.5 x 19 inches',
  [HmpbBallotPaperSize.Custom20]: '8.5 x 20 inches',
  [HmpbBallotPaperSize.Custom22]: '8.5 x 22 inches',
};

export function BallotDesignForm({
  electionId,
  savedLayoutSettings,
  ballotsFinalizedAt,
  ballotTemplateId,
}: {
  electionId: ElectionId;
  savedLayoutSettings: {
    paperSize: HmpbBallotPaperSize;
    compact: boolean;
  };
  ballotsFinalizedAt: Date | null;
  ballotTemplateId: BallotTemplateId;
}): JSX.Element | null {
  const [isEditing, setIsEditing] = useState(false);
  const [layoutSettings, setLayoutSettings] = useState(savedLayoutSettings);

  const updateBallotLayoutSettingsMutation =
    updateBallotLayoutSettings.useMutation();
  const getStateFeaturesQuery =
    electionDefinitionApi.getStateFeatures.useQuery(electionId);

  // @coverage-exclude
  if (!getStateFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getStateFeaturesQuery.data;

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
              features.ONLY_LETTER_AND_LEGAL_PAPER_SIZES
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
      {ballotTemplateId !== 'MiBallot' &&
        ballotTemplateId !== 'NhStateBallot' && (
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
            disabled={!!ballotsFinalizedAt}
            onPress={() => setIsEditing(true)}
          >
            Edit
          </Button>
        </FormActionsRow>
      )}
      {features.ONLY_LETTER_AND_LEGAL_PAPER_SIZES && (
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
