/* eslint-disable @typescript-eslint/no-use-before-define */
/* istanbul ignore file - @preserve */
import { ElectionStringKey } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { Client } from './db/client';

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

export interface AudioOverrideQuery {
  electionId: string;
  key: string;
  subkey: string;
}

export interface AudioOverrideKey {
  key: string;
  subkey: string;
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
      params.subkey
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
      params.electionId
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
          subkey
        from audio_overrides
        where
          election_id = $1
      `,
      params.electionId
    );

    const keys: AudioOverrideKey[] = [];
    for (const row of res.rows) keys.push(row);

    return keys;
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
    return set(client, {
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
    return set(client, {
      dataUrl: params.dataUrl,
      electionId: params.electionId,
      key: ElectionStringKey.LA_CONTEST_AUDIO,
      originalFilename: params.originalFilename,
      subkey: params.contestId,
    });
  },
} as const;

async function set(
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
