/* eslint-disable @typescript-eslint/no-use-before-define */
/* istanbul ignore file - @preserve */
import { ElectionStringKey } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { Client } from './db/client';

export interface AudioQuery {
  electionId: string;
  key: string;
  subkey?: string;
}

export interface AudioOverride {
  dataUrl: string;
  originalFilename: string;
  uploadedAt: Date;
}

export interface AudioOverrideCandidate {
  candidateId: string;
  dataUrl: string;
  electionId: string;
  originalFilename: string;
}

export interface AudioOverrideContest {
  contestId: string;
  dataUrl: string;
  electionId: string;
  originalFilename: string;
}

export type AudioOverrideQuery = AudioQuery;

export interface AudioOverrideKey {
  key: string;
  subkey: string;
  originalFilename: string;
}

export const audioOverrides = {
  async dataUrl(
    client: Client,
    params: AudioOverrideQuery
  ): Promise<string | null> {
    const res = await client.query(
      `
      select
        data_url
      from audio_overrides
      where
        election_id = $1 and
        key = $2 and
        subkey = $3
      `,
      params.electionId,
      params.key,
      params.subkey || ''
    );

    if (res.rows.length === 0) return null;

    return assertDefined(res.rows[0]['data_url']);
  },

  async exists(client: Client, params: AudioOverrideQuery): Promise<boolean> {
    const res = await client.query(
      `
        select
          key
        from audio_overrides
        where
          election_id = $1
          and key = $2
          and subkey = $3
      `,
      params.electionId,
      params.key,
      params.subkey
    );

    return res.rows.length > 0;
  },

  async keys(
    client: Client,
    params: { electionId: string }
  ): Promise<AudioOverrideKey[]> {
    const res = await client.query(
      `
        select
          key,
          subkey,
          original_filename as "originalFilename"
        from audio_overrides
        where
          election_id = $1
      `,
      params.electionId
    );

    return res.rows;
  },

  async get(
    client: Client,
    params: AudioOverrideQuery
  ): Promise<AudioOverride | null> {
    const res = await client.query(
      `
      select
        data_url as "dataUrl",
        original_filename as "originalFilename",
        uploaded_at as "uploadedAt"
      from audio_overrides
      where
        election_id = $1 and
        key = $2 and
        subkey = $3
      `,
      params.electionId,
      params.key,
      params.subkey
    );

    if (res.rows.length === 0) return null;

    return {
      dataUrl: res.rows[0].dataUrl,
      originalFilename: res.rows[0].originalFilename,
      uploadedAt: new Date(res.rows[0].uploadedAt),
    };
  },

  async setCandidate(
    client: Client,
    params: AudioOverrideCandidate
  ): Promise<void> {
    return setOverride(client, {
      dataUrl: params.dataUrl,
      electionId: params.electionId,
      key: ElectionStringKey.LA_CANDIDATE_AUDIO,
      originalFilename: params.originalFilename,
      subkey: params.candidateId,
    });
  },

  async setContest(
    client: Client,
    params: AudioOverrideContest
  ): Promise<void> {
    return setOverride(client, {
      dataUrl: params.dataUrl,
      electionId: params.electionId,
      key: ElectionStringKey.LA_CONTEST_AUDIO,
      originalFilename: params.originalFilename,
      subkey: params.contestId,
    });
  },
} as const;

async function setOverride(
  client: Client,
  params: {
    dataUrl: string;
    electionId: string;
    key: string;
    subkey: string;
    originalFilename: string;
  }
): Promise<void> {
  await client.query(
    `
        insert into audio_overrides (
          election_id,
          key,
          subkey,
          data_url,
          original_filename
        )
        values ($1, $2, $3, $4, $5)
        on conflict (election_id, key, subkey) do update
        set
          data_url = EXCLUDED.data_url,
          original_filename = EXCLUDED.original_filename,
          uploaded_at = current_timestamp
      `,
    params.electionId,
    params.key,
    params.subkey,
    params.dataUrl,
    params.originalFilename
  );
}

export type AudioSource = 'tts' | 'phonetic' | 'recorded';

export interface AudioSourceEntry {
  electionId: string;
  key: string;
  source: AudioSource;
  subkey: string;
}

export const audioSources = {
  async get(client: Client, params: AudioQuery): Promise<AudioSource> {
    const res = await client.query(
      `
      select
        source
      from audio_sources
      where
        election_id = $1 and
        key = $2 and
        subkey = $3
      `,
      params.electionId,
      params.key,
      params.subkey
    );

    if (res.rows.length === 0) {
      if (await audioOverrides.exists(client, params)) {
        return 'recorded';
      }

      return 'tts';
    }

    return assertDefined(res.rows[0]['source']);
  },

  async set(client: Client, params: AudioSourceEntry): Promise<void> {
    await client.query(
      `
          insert into audio_sources (
            election_id,
            key,
            subkey,
            source
          )
          values ($1, $2, $3, $4)
          on conflict (election_id, key, subkey) do update
          set source = EXCLUDED.source
        `,
      params.electionId,
      params.key,
      params.subkey,
      params.source
    );
  },
} as const;

export interface SsmlChunk {
  syllables?: TtsSyllable[];
  text: string;
}

export interface TtsSyllable {
  ipaPhonemes: string[];
  stress?: 'primary' | 'secondary';
}

export interface TtsPhoneme {
  ipa: string;
}

export interface TtsPhoneticEntry {
  electionId: string;
  key: string;
  subkey?: string;
  ssmlChunks: SsmlChunk[];
}

export const ttsPhoneticOverrides = {
  async get(client: Client, params: AudioQuery): Promise<SsmlChunk[] | null> {
    const res = await client.query(
      `
      select
        ssml_chunks
      from tts_phonetic_overrides
      where
        election_id = $1 and
        key = $2 and
        subkey = $3
      `,
      params.electionId,
      params.key,
      params.subkey
    );

    if (res.rows.length === 0) return null;

    return assertDefined(res.rows[0]['ssml_chunks']);
  },

  async set(client: Client, params: TtsPhoneticEntry): Promise<void> {
    await client.query(
      `
          insert into tts_phonetic_overrides (
            election_id,
            key,
            subkey,
            ssml_chunks
          )
          values ($1, $2, $3, $4)
          on conflict (election_id, key, subkey) do update
          set ssml_chunks = EXCLUDED.ssml_chunks
        `,
      params.electionId,
      params.key,
      params.subkey,
      JSON.stringify(params.ssmlChunks)
    );
  },
} as const;

export interface TtsTextEntry {
  electionId: string;
  key: string;
  subkey?: string;
  text: string;
}

export const ttsTextOverrides = {
  async get(client: Client, params: AudioQuery): Promise<string | null> {
    const res = await client.query(
      `
      select
        text
      from tts_text_overrides
      where
        election_id = $1 and
        key = $2 and
        subkey = $3
      `,
      params.electionId,
      params.key,
      params.subkey
    );

    if (res.rows.length === 0) return null;

    return assertDefined(res.rows[0]['text']);
  },

  async set(client: Client, params: TtsTextEntry): Promise<void> {
    await client.query(
      `
          insert into tts_text_overrides (
            election_id,
            key,
            subkey,
            text
          )
          values ($1, $2, $3, $4)
          on conflict (election_id, key, subkey) do update
          set text = EXCLUDED.text
        `,
      params.electionId,
      params.key,
      params.subkey,
      params.text
    );
  },
} as const;
