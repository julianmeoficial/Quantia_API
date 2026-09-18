import { SyncEntityType, SyncStatus } from '@prisma/client';
import { NotionSyncService } from './notion-sync.service';

describe('NotionSyncService idempotency', () => {
  it('marks duplicate when last_edited_time is not newer than synced_at', async () => {
    const syncedAt = new Date('2026-01-02T00:00:00.000Z');
    const lastEditedTime = new Date('2026-01-01T00:00:00.000Z');
    const syncEventUpdate = jest.fn().mockResolvedValue({});

    const prisma = {
      syncEvent: {
        update: syncEventUpdate,
      },
      project: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1',
          syncedAt,
          lastEditedTime,
          syncStatus: SyncStatus.SYNCED,
        }),
      },
      user: { findUnique: jest.fn() },
      task: { findUnique: jest.fn() },
      progress: { findUnique: jest.fn() },
    };

    const notion = {
      getPage: jest.fn().mockResolvedValue({
        id: 'notion-page',
        last_edited_time: '2026-01-01T00:00:00.000Z',
        parent: { database_id: '5c857af6-f89c-41a4-9ed6-e59af6a53454' },
        properties: { Nombre: { title: [{ plain_text: 'Alpha' }] } },
      }),
    };

    const config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          NOTION_DB_USERS: '182336f1-ce31-4495-bd88-f168bf3aa3bc',
          NOTION_DS_USERS: '6a429964-8f61-43c9-952d-1e68fb3e578c',
          NOTION_DB_PROJECTS: '5c857af6-f89c-41a4-9ed6-e59af6a53454',
          NOTION_DS_PROJECTS: 'f34435f4-95c6-4e98-b808-c2cc93a563ca',
          NOTION_DB_TASKS: '9d0bd14e-6be8-4f99-9de6-8375f8600770',
          NOTION_DS_TASKS: 'f5f6ecfa-e866-4234-b481-19849da9944f',
          NOTION_DB_PROGRESS: '950366a7-30f3-4f00-9094-a2d1af9209d9',
          NOTION_DS_PROGRESS: '59238cc9-6691-414e-af53-bcd9648e9897',
        };
        return map[key];
      }),
    };

    const service = new NotionSyncService(
      notion as never,
      prisma as never,
      config as never,
    );

    await service.syncNotionPageToDb({
      notionPageId: 'notion-page',
      entityType: SyncEntityType.PROJECT,
      lastEditedTime: '2026-01-01T00:00:00.000Z',
      syncEventId: 'evt-1',
      attempt: 1,
    });

    expect(syncEventUpdate.mock.calls.length).toBeGreaterThan(0);
    const lastCall = syncEventUpdate.mock.calls[
      syncEventUpdate.mock.calls.length - 1
    ] as [{ data: { status: string } }];
    expect(lastCall[0].data.status).toBe('DUPLICATE');
  });
});
