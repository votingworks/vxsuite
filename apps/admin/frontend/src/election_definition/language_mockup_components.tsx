import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ok, sleep } from '@votingworks/basics';
import type { ExportDataResult } from '@votingworks/admin-backend';
import { LanguageCode } from '@votingworks/types';
import {
  Button,
  CheckboxButton,
  Loading,
  Modal,
  ModalWidth,
  P,
} from '@votingworks/ui';
import { SaveBackendFileModal } from '../components/save_backend_file_modal.js';
import {
  ALL_LANGUAGES,
  languageName,
  setEnabledLanguages,
  useLanguageMockupState,
} from './language_mockup.js';

/** Delay that makes mock saves and loads show their progress modals. */
const MOCK_FILE_DELAY_MS = 1200;

export function todayStamp(): string {
  const now = new Date();
  function pad(n: number) {
    return String(n).padStart(2, '0');
  }
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`;
}

export function MockSaveButton({
  label,
  fileType,
  fileTypeTitle,
  filename,
  disabled,
}: {
  label: string;
  fileType: string;
  fileTypeTitle: string;
  filename: string;
  disabled?: boolean;
}): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const saveMutation = useMutation(async (): Promise<ExportDataResult> => {
    await sleep(MOCK_FILE_DELAY_MS);
    return ok([filename]);
  });
  return (
    <React.Fragment>
      <Button icon="Export" disabled={disabled} onPress={() => setIsOpen(true)}>
        {label}
      </Button>
      {isOpen && (
        <SaveBackendFileModal
          saveFileStatus={saveMutation.status}
          saveFile={() => saveMutation.mutate()}
          saveFileResult={saveMutation.data}
          resetSaveFileResult={saveMutation.reset}
          onClose={() => setIsOpen(false)}
          fileType={fileType}
          fileTypeTitle={fileTypeTitle}
          filename={filename}
        />
      )}
    </React.Fragment>
  );
}

export function MockLoadButton({
  label,
  loadingTitle,
  loadedTitle,
  disabled,
  onLoad,
}: {
  label: string;
  loadingTitle: string;
  loadedTitle: string;
  disabled?: boolean;
  onLoad: () => string;
}): JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [message, setMessage] = useState('');

  async function load() {
    setPhase('loading');
    await sleep(MOCK_FILE_DELAY_MS);
    setMessage(onLoad());
    setPhase('loaded');
  }

  return (
    <React.Fragment>
      <Button
        icon="Import"
        variant="primary"
        disabled={disabled}
        onPress={() => void load()}
      >
        {label}
      </Button>
      {phase === 'loading' && (
        <Modal
          centerContent
          modalWidth={ModalWidth.Wide}
          content={<Loading>{loadingTitle}</Loading>}
        />
      )}
      {phase === 'loaded' && (
        <Modal
          title={loadedTitle}
          content={<P>{message}</P>}
          actions={<Button onPress={() => setPhase('idle')}>Close</Button>}
          onOverlayClick={() => setPhase('idle')}
        />
      )}
    </React.Fragment>
  );
}

export function ManageLanguagesButton(): JSX.Element {
  const { enabledLanguages } = useLanguageMockupState();
  const [draft, setDraft] = useState<readonly LanguageCode[]>();

  return (
    <React.Fragment>
      <Button icon="Language" onPress={() => setDraft(enabledLanguages)}>
        Manage Languages
      </Button>
      {draft && (
        <Modal
          title="Manage Languages"
          content={
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {ALL_LANGUAGES.map((code) => (
                <CheckboxButton
                  key={code}
                  label={languageName(code)}
                  isChecked={draft.includes(code)}
                  disabled={code === LanguageCode.ENGLISH}
                  onChange={(isChecked) =>
                    setDraft(
                      isChecked
                        ? [...draft, code]
                        : draft.filter((c) => c !== code)
                    )
                  }
                />
              ))}
            </div>
          }
          actions={
            <React.Fragment>
              <Button
                variant="primary"
                onPress={() => {
                  setEnabledLanguages(draft);
                  setDraft(undefined);
                }}
              >
                Save
              </Button>
              <Button onPress={() => setDraft(undefined)}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={() => setDraft(undefined)}
        />
      )}
    </React.Fragment>
  );
}
