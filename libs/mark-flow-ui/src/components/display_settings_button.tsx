import { Button, Icons, appStrings } from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { Paths } from '../config/globals';

const LabelContainer = styled.span`
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: 0.5rem;
  text-align: left;
`;

export function DisplaySettingsButton(): JSX.Element | null {
  const history = useHistory();

  return (
    <Button
      onPress={(target: string) => history.push(target)}
      value={Paths.DISPLAY_SETTINGS}
    >
      <LabelContainer>
        <Icons.Display />
        {appStrings.buttonDisplaySettings()}
      </LabelContainer>
    </Button>
  );
}
