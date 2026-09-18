jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
  Processor: () => (cls: unknown) => cls,
  WorkerHost: class WorkerHost {
    process(): Promise<void> {
      return Promise.resolve();
    }
  },
  BullModule: {
    forRoot: () => ({ module: class MockBullRoot {}, global: true }),
    forRootAsync: () => ({
      module: class MockBullRootAsync {},
      global: true,
      providers: [],
      exports: [],
    }),
    registerQueue: () => ({
      module: class MockBullQueue {},
      providers: [
        {
          provide: 'BullQueue_notion-sync',
          useValue: {
            add: jest.fn().mockResolvedValue({ id: 'job-1' }),
          },
        },
      ],
      exports: [
        {
          provide: 'BullQueue_notion-sync',
          useValue: {
            add: jest.fn().mockResolvedValue({ id: 'job-1' }),
          },
        },
      ],
    }),
  },
}));

jest.mock('bullmq', () => ({
  Queue: class Queue {
    add = jest.fn().mockResolvedValue({ id: 'job-1' });
  },
  Job: class Job {},
  Worker: class Worker {},
}));
