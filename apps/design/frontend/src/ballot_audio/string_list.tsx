import React from 'react';
import { Link, useParams } from 'react-router-dom';

import { DesktopPalette, Icons } from '@votingworks/ui';

import styled from 'styled-components';
import { TtsStringDefault } from '@votingworks/design-backend';
import * as api from '../api';
import { routes } from '../routes';
import { BallotAudioPathParams } from './routes';

const Container = styled.div`
  align-self: start;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border: 1px solid #ccc;
  box-shadow:
    0.05rem 0.075rem 0.1rem 0 #00000010,
    0.1rem 0.15rem 0.1rem 0.05rem #00000004,
    0.15rem 0.25rem 0.125rem 0.075rem #00000002;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  max-height: 100%;
  overflow: hidden;
  width: max(50%, 60ch);
  min-width: 50ch;
`;

const SearchBox = styled.div`
  box-shadow: 0 0.15rem 0.2rem #00000008;
  position: relative;

  svg {
    color: #aaa;
    position: absolute;
    left: 1.25rem;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  :focus-within {
    svg {
      color: ${DesktopPalette.Purple60};
    }
  }

  input {
    background: none;
    border: 0;
    border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom: 3px solid #aaa;
    margin: 0;
    padding: 0.75rem 0.5rem 0.5rem;
    padding-left: 2.5rem;
    width: 100%;

    :focus {
      border: none;
      border-bottom: 3px solid ${DesktopPalette.Purple60};
      outline: none;
    }
  }
`;

const StringSnippets = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: scroll;
  scrollbar-width: none;
  box-shadow:
    inset 0 0.15rem 0.2rem #00000008,
    inset 0 -0.15rem 0.2rem #00000008;
`;

export function StringList(): React.ReactNode {
  const { electionId } = useParams<BallotAudioPathParams>();
  const stringDefaults = api.ttsStringDefaults.useQuery(electionId).data;

  // [TODO] Filter list based on search input.
  const searchResults: TtsStringDefault[] = stringDefaults || [];

  if (!stringDefaults) return null;

  return (
    <Container>
      <SearchBox>
        <Icons.Search />
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          placeholder="Search ballot contents"
          type="text"
        />
      </SearchBox>
      <StringSnippets>
        {searchResults.map((str) => (
          <Snippet key={stringKeyJoin(str)} str={str} />
        ))}
      </StringSnippets>
    </Container>
  );
}

const SnippetLink = styled(Link)`
  background: none;
  border-bottom: 1px solid #eee;
  border: none;
  box-shadow: inset 0 0 0 ${DesktopPalette.Purple40};
  box-sizing: border-box;
  color: #666 !important;
  cursor: pointer;
  display: block;
  font-size: 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  margin: 0;
  min-height: max-content;
  overflow-x: hidden;
  overflow-y: visible;
  padding: 0.75rem;
  text-align: left;
  text-decoration: none;
  text-overflow: ellipsis;
  transition-duration: 120ms;
  transition-property: background-color, border, color;
  transition-timing-function: ease-out;
  white-space: nowrap;

  :focus,
  :hover {
    background-color: ${DesktopPalette.Purple10} !important;
    box-shadow: inset 0.3rem 0 0 ${DesktopPalette.Purple40};
    color: #000 !important;
    filter: none !important;
    outline: none;
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple20} !important;
    box-shadow: inset 0.3rem 0 0 ${DesktopPalette.Purple60};
    color: #000 !important;
  }
`;

function Snippet(props: { str: TtsStringDefault }) {
  const { str } = props;
  const {
    ttsMode = 'text',
    electionId,
    stringKey,
    subkey,
  } = useParams<BallotAudioPathParams>();

  const selected = stringKey === str.key && subkey === str.subkey;

  const href = routes
    .election(electionId)
    .ballots.audio.manage(ttsMode, str.key, str.subkey).path;

  return (
    <SnippetLink aria-selected={selected} to={href} role="option">
      {str.text}
    </SnippetLink>
  );
}

function stringKeyJoin(info: TtsStringDefault) {
  if (!info.subkey) return info.key;

  return `${info.key}.${info.subkey}`;
}
