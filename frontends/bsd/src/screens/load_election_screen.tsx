import { assert } from '@votingworks/utils';
import React, { useContext, useState } from 'react';
import { ElectionConfiguration } from '../components/election_configuration';
import { Main, MainChild } from '../components/main';
import { Prose } from '../components/prose';
import { Screen } from '../components/screen';
import { AppContext } from '../contexts/app_context';

export interface Props {
  onLoad(): void;
}

export function LoadElectionScreen({ onLoad }: Props): JSX.Element {
  const { currentUserSession } = useContext(AppContext);
  assert(currentUserSession);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  async function onManualFileImport(file: File) {
    const formData = new FormData();
    setIsLoadingTemplates(true);
    if (file.name.endsWith('.zip')) {
      formData.append('package', file, file.name);
      await fetch(`/config/package`, {
        method: 'PUT',
        body: formData,
      });
    } else {
      formData.append('election', file, file.name);
      await fetch(`/config/election`, {
        method: 'PUT',
        body: formData,
      });
    }
    onLoad();
  }

  async function onAutomaticFileImport(file: KioskBrowser.FileSystemEntry) {
    assert(kiosk);

    const pkg = await kiosk.readFile(file.path);
    const formData = new FormData();
    formData.append(
      'package',
      new Blob([pkg], { type: 'application/octet-stream' })
    );
    setIsLoadingTemplates(true);
    await fetch(`/config/package`, {
      method: 'PUT',
      body: formData,
    });
    onLoad();
  }

  if (isLoadingTemplates) {
    return (
      <Screen>
        <Main noPadding>
          <MainChild center padded>
            <Prose textCenter>
              <h1>Preparing VxCentralScan…</h1>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
    );
  }

  return (
    <ElectionConfiguration
      acceptManuallyChosenFile={onManualFileImport}
      acceptAutomaticallyChosenFile={onAutomaticFileImport}
    />
  );
}
