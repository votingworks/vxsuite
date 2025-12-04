import React from 'react';

import { DesktopPalette } from '@votingworks/ui';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import { TtsStringDefault } from '@votingworks/design-backend';
import { StringList } from './string_list';
import { BallotAudioPathParams } from './routes';
import * as api from '../api';
import { StringPanel } from './elements';
import { StringInfo } from './string_info';
import { EditPanel } from './edit_panel';

const Body = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 1rem;
  min-width: 50ch;
  overflow: auto;
  padding: 0 1rem 1rem;
  width: 100%;
`;

const Container = styled.div`
  box-sizing: border-box;
  display: flex;
  gap: 1rem;
  height: 100%;
  line-height: 1.4;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 1rem 0 0;
  width: 100%;

  * {
    :focus {
      outline: 0.125rem dashed ${DesktopPalette.Purple70};

      :not(:focus-visible) {
        outline: none;
      }
    }
  }
`;

export function BallotAudioScreen(): React.ReactNode {
  const { electionId, stringKey, subkey } = useParams<BallotAudioPathParams>();

  const electionInfo = api.getElectionInfo.useQuery(electionId).data;
  const stringDefaults = api.ttsStringDefaults.useQuery(electionId).data;
  const currentString = React.useMemo(() => {
    if (!stringKey || !stringDefaults) return undefined;

    for (const appString of stringDefaults) {
      if (appString.key !== stringKey || appString.subkey !== subkey) continue;

      return appString;
    }
  }, [stringDefaults, stringKey, subkey]);

  if (!stringDefaults || !electionInfo) return null;

  return (
    <Container>
      <StringList />
      <Body>
        {currentString && (
          <StringPanel>
            <StringInfo
              stringKey={currentString.key}
              subkey={currentString.subkey}
              text={currentString.text}
            />
            <EditPanel
              languageCode="en"
              orgId={electionInfo.orgId}
              key={joinStringKey(currentString)}
              ttsDefault={currentString}
            />
          </StringPanel>
        )}
      </Body>
    </Container>
  );
}

function joinStringKey(info: TtsStringDefault) {
  if (!info.subkey) return info.key;

  return `${info.key}.${info.subkey}`;
}
