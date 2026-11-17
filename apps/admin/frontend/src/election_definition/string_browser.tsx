import React, { useState } from 'react';
import styled from 'styled-components';
import { Caption, Icons, RichText, SearchSelect } from '@votingworks/ui';
import type { LanguageCode } from '@votingworks/types';
import {
  type ElectionString,
  type ElectionStringGroup,
  languageName,
} from './language_mockup.js';

const Toolbar = styled.div`
  display: grid;
  gap: 0.5rem 1rem;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 1rem 1rem 0.75rem;
`;

const LanguageControls = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;
`;

const ToolbarActions = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: end;
`;

const ToolbarStatus = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;
`;

const LastUpdated = styled.div`
  text-align: right;
`;

const Panes = styled.div`
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  display: grid;
  flex-grow: 1;
  grid-template-columns: 20rem 1fr;
  min-height: 0;
`;

const ListPane = styled.div`
  border-right: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

const SearchBox = styled.div`
  align-items: center;
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: 0.5rem;
  display: flex;
  gap: 0.5rem;
  margin: 0.5rem;
  padding: 0.25rem 0.5rem;

  input {
    background: none;
    border: none;
    flex-grow: 1;
    font-size: 1rem;
    outline: none;
  }
`;

const List = styled.div`
  overflow-y: auto;
`;

const GroupHeader = styled.div`
  background: ${(p) => p.theme.colors.container};
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  padding: 0.25rem 0.75rem;
  position: sticky;
  top: 0;
`;

const ListItem = styled.button<{ isSelected: boolean }>`
  align-items: center;
  background: ${(p) =>
    p.isSelected ? p.theme.colors.primaryContainer : 'none'};
  border: none;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  border-left: 0.25rem solid
    ${(p) => (p.isSelected ? p.theme.colors.primary : 'transparent')};
  color: inherit;
  cursor: pointer;
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  text-align: left;
  width: 100%;
`;

const ListItemText = styled.div`
  flex-grow: 1;
  min-width: 0;

  > :last-child {
    display: block;
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const DetailPane = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  padding: 1rem;
`;

const StringId = styled.code`
  font-size: 0.75rem;
`;

export const DetailCard = styled.div`
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 1rem 0.75rem;
`;

export const Layout = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

export function DetailText({
  string,
  text,
}: {
  string: ElectionString;
  text?: string;
}): JSX.Element {
  if (text === undefined) {
    return (
      <div>
        <Caption italic>
          <Icons.Warning color="warning" /> Missing
        </Caption>
      </div>
    );
  }
  return string.isRichText ? (
    <RichText dangerouslySetInnerHTML={{ __html: text }} />
  ) : (
    <div>{text}</div>
  );
}

export interface StringBrowserProps {
  languageCode: LanguageCode;
  languageOptions: readonly LanguageCode[];
  onChangeLanguage: (languageCode: LanguageCode) => void;
  languageActions?: React.ReactNode;
  actions: React.ReactNode;
  status: React.ReactNode;
  lastUpdated?: Date;
  groups: readonly ElectionStringGroup[];
  isMissing: (string: ElectionString) => boolean;
  renderDetail: (string: ElectionString) => React.ReactNode;
}

export function StringBrowser({
  languageCode,
  languageOptions,
  onChangeLanguage,
  languageActions,
  actions,
  status,
  lastUpdated,
  groups,
  isMissing,
  renderDetail,
}: StringBrowserProps): JSX.Element {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const query = search.trim().toLowerCase();
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      strings: group.strings.filter(
        (s) =>
          !query ||
          s.english.toLowerCase().includes(query) ||
          s.context.toLowerCase().includes(query)
      ),
    }))
    .filter((group) => group.strings.length > 0);
  const allStrings = groups.flatMap((group) => group.strings);
  const selected = allStrings.find((s) => s.id === selectedId) ?? allStrings[0];

  return (
    <Layout>
      <Toolbar>
        <LanguageControls>
          <SearchSelect<LanguageCode>
            aria-label="Language"
            value={languageCode}
            options={languageOptions.map((code) => ({
              value: code,
              label: languageName(code),
            }))}
            onChange={(value) => value && onChangeLanguage(value)}
            style={{ width: '16rem' }}
          />
          {languageActions}
        </LanguageControls>
        <ToolbarActions>{actions}</ToolbarActions>
        <ToolbarStatus>{status}</ToolbarStatus>
        <LastUpdated>
          Last updated:{' '}
          {lastUpdated
            ? lastUpdated.toLocaleString('en-US', {
                dateStyle: 'short',
                timeStyle: 'short',
              })
            : 'Never'}
        </LastUpdated>
      </Toolbar>
      <Panes>
        <ListPane>
          <SearchBox>
            <Icons.Search />
            <input
              aria-label="Search"
              placeholder="Search..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </SearchBox>
          <List>
            {filteredGroups.map((group) => (
              <React.Fragment key={group.title}>
                <GroupHeader>{group.title}</GroupHeader>
                {group.strings.map((s) => (
                  <ListItem
                    key={s.id}
                    isSelected={s.id === selected?.id}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <ListItemText>
                      <Caption>{s.context}</Caption>
                      <span>{s.english.replace(/<[^>]+>/g, '')}</span>
                    </ListItemText>
                    {isMissing(s) && <Icons.Warning color="warning" />}
                  </ListItem>
                ))}
              </React.Fragment>
            ))}
          </List>
        </ListPane>
        <DetailPane>
          {selected && (
            <React.Fragment>
              <div>
                <h3 style={{ margin: 0 }}>{selected.context}</h3>
                <StringId>{selected.id}</StringId>
              </div>
              {renderDetail(selected)}
            </React.Fragment>
          )}
        </DetailPane>
      </Panes>
    </Layout>
  );
}
