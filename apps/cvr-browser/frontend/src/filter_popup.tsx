import React, { useCallback, useState } from 'react';
import { safeParseNumber } from '@votingworks/types';
import styled from 'styled-components';
import {
  Button,
  CheckboxButton,
  Modal,
  RadioGroup,
} from '@votingworks/ui';
import type { Filter } from './types';

const FieldGroup = styled.fieldset`
  border: none;
  padding: 0;
  margin: 0 0 1rem;
`;

const FieldLabel = styled.legend`
  font-weight: 600;
  margin-bottom: 0.25rem;
`;

const ScoreFields = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
`;

const ScoreInput = styled.input`
  width: 5rem;
  margin-left: 0.5rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid ${(p) => p.theme.colors.outline};
  border-radius: 0.25rem;
`;

interface FilterPopupProps {
  readonly filter: Filter;
  readonly availableStyles: string[];
  readonly onApply: (filter: Filter) => void;
  readonly onCancel: () => void;
}

export function FilterPopup({
  filter,
  availableStyles,
  onApply,
  onCancel,
}: FilterPopupProps): JSX.Element {
  const [selectedStyle, setSelectedStyle] = useState(
    filter.ballotStyle || '__all__'
  );
  const [scoreMinStr, setScoreMinStr] = useState(
    filter.wiScoreMin.toFixed(2)
  );
  const [scoreMaxStr, setScoreMaxStr] = useState(
    filter.wiScoreMax.toFixed(2)
  );
  const [showRejected, setShowRejected] = useState(filter.showRejected);

  const buildFilter = useCallback((): Filter => {
    const ballotStyle = selectedStyle === '__all__' ? '' : selectedStyle;
    const minResult = safeParseNumber(scoreMinStr);
    const maxResult = safeParseNumber(scoreMaxStr);
    const min = minResult.isOk() ? minResult.ok() : 0;
    const max = maxResult.isOk() ? maxResult.ok() : 1;
    return {
      ballotStyle,
      wiScoreMin: min,
      wiScoreMax: max,
      showRejected,
      writeInFilterEnabled: min > 0 || max < 1,
    };
  }, [selectedStyle, scoreMinStr, scoreMaxStr, showRejected]);

  const styleOptions = [
    { value: '__all__', label: 'All styles' },
    ...availableStyles.map((s) => ({ value: s, label: s })),
  ];

  return (
    <Modal
      title="Filter Ballots"
      content={
        <React.Fragment>
          <FieldGroup>
            <FieldLabel>Ballot Style</FieldLabel>
            <RadioGroup
              label="Ballot Style"
              hideLabel
              options={styleOptions}
              value={selectedStyle}
              onChange={setSelectedStyle}
            />
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>Bubble Score Range</FieldLabel>
            <ScoreFields>
              {/* eslint-disable jsx-a11y/label-has-associated-control */}
              <label>
                Min:
                <ScoreInput
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={scoreMinStr}
                  onChange={(e) => setScoreMinStr(e.target.value)}
                />
              </label>
              <label>
                Max:
                <ScoreInput
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={scoreMaxStr}
                  onChange={(e) => setScoreMaxStr(e.target.value)}
                />
              </label>
              {/* eslint-enable jsx-a11y/label-has-associated-control */}
            </ScoreFields>
          </FieldGroup>

          <CheckboxButton
            label="Show rejected ballots"
            isChecked={showRejected}
            onChange={setShowRejected}
          />
        </React.Fragment>
      }
      actions={
        <React.Fragment>
          <Button variant="primary" onPress={() => onApply(buildFilter())}>
            Apply
          </Button>
          <Button onPress={onCancel}>Cancel</Button>
        </React.Fragment>
      }
      onOverlayClick={onCancel}
    />
  );
}
