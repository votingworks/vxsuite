import { beforeEach, expect, test, vi } from 'vitest';
import {
  Connection,
  ApiResponse,
  OrganizationsManager,
  Database,
  UsersManager,
  GetOrganizations200ResponseOneOfInner,
  GetUsers200ResponseOneOfInner,
  UserCreate,
  ChangePasswordRequest,
} from 'auth0';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { Auth0Client, ConnectionType } from './auth0_client';
import { sliOrgId, votingWorksOrgId } from './globals';

vi.mock(import('auth0'));
vi.mock(import('node:crypto'));
vi.mock(import('./globals.js'));

const SLI_ORG_ID = 'sli';
const VX_ORG_ID = 'vx';

const mockDatabase = vi.mocked(Database.prototype);
const mockOrganizations = vi.mocked(OrganizationsManager.prototype);
const mockUsers = vi.mocked(UsersManager.prototype);

const mockRandomBytes = vi.mocked(crypto.randomBytes);

function mockConnection(kind: ConnectionType): Connection {
  return { id: `id-${kind}`, name: kind } as unknown as Connection;
}

const CONNECTION_USERNAME_PASSWORD = mockConnection(
  'Username-Password-Authentication'
);

function mockApiResponse<T>(data: Partial<T>): ApiResponse<T> {
  return { data: data as unknown as T } as unknown as ApiResponse<T>;
}

function newClient() {
  return new Auth0Client(mockDatabase, mockUsers);
}

beforeEach(() => {
  vi.mocked(sliOrgId).mockReturnValue(SLI_ORG_ID);
  vi.mocked(votingWorksOrgId).mockReturnValue(VX_ORG_ID);
});

test('createUser', async () => {
  mockOrganizations.get.mockResolvedValueOnce(
    mockApiResponse<GetOrganizations200ResponseOneOfInner>({
      display_name: 'VotingWorks',
      id: VX_ORG_ID,
      name: 'votingworks',
    })
  );

  mockUsers.create.mockResolvedValueOnce(
    mockApiResponse<GetUsers200ResponseOneOfInner>({
      user_id: 'new-user',
      name: 'alice@example.com',
    })
  );

  mockRandomBytes.mockImplementation(() => Buffer.from('top-secret'));

  const result = await newClient().createUser({
    userEmail: 'alice@example.com',
    connectionType: 'Username-Password-Authentication',
  });

  expect(result).toEqual('new-user');

  expect(mockUsers.create).toHaveBeenCalledWith<[UserCreate]>({
    connection: CONNECTION_USERNAME_PASSWORD.name,
    email: 'alice@example.com',
    password: Buffer.from('top-secret').toString('base64'),
  });
});

test('sendWelcomeEmail', async () => {
  mockDatabase.changePassword.mockResolvedValueOnce(
    mockApiResponse<string>('ok')
  );

  await newClient().sendWelcomeEmail({
    connectionType: 'Username-Password-Authentication',
    userEmail: 'bob@example.com',
  });

  expect(mockDatabase.changePassword).toHaveBeenCalledWith<
    [ChangePasswordRequest]
  >({
    connection: 'Username-Password-Authentication',
    email: 'bob@example.com',
  });
});
