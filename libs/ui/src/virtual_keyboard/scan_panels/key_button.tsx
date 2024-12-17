import styled from 'styled-components';
import { Button } from '../../button';
import { WithAltAudio } from '../../ui_strings';
import { getBorderWidthRem, Key } from '../common';

const Wrapper = styled.div`
  display: flex;
  flex-direction: row;

  button {
    border-width: ${getBorderWidthRem}rem;
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
    min-height: ${(p) => p.theme.sizes.minTouchAreaSizePx}px;
    min-width: ${(p) => p.theme.sizes.minTouchAreaSizePx}px;

    &:disabled {
      border-width: ${getBorderWidthRem}rem;
    }
  }
`;

export interface KeyButtonProps {
  keySpec: Key;
  onKeyPress: (key: string) => void;
  disabled: boolean;
  selectable: boolean;
}

/**
 * KeyButton is a visual representation of a single keyboard key.
 */
export function KeyButton({
  keySpec,
  onKeyPress,
  disabled,
  selectable,
}: KeyButtonProps): JSX.Element {
  const {
    audioLanguageOverride,
    renderAudioString,
    value,
    renderLabel = () => value,
  } = keySpec;

  return (
    <Wrapper>
      {selectable ? (
        <Button
          key={value}
          value={value}
          onPress={onKeyPress}
          disabled={disabled}
        >
          <WithAltAudio
            audioLanguageOverride={audioLanguageOverride}
            audioText={renderAudioString()}
          >
            {renderLabel()}
          </WithAltAudio>
        </Button>
      ) : (
        renderLabel()
      )}
    </Wrapper>
  );
}
