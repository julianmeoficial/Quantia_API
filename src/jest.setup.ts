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
    forRootAsync: () => ({ module: class MockBullRootAsync {}, global: true }),
    registerQueue: () => ({
      module: class MockBullQueue {},
      providers: [],
      exports: [],
    }),
  },
}));

jest.mock('bullmq', () => ({
  Queue: class Queue {},
  Job: class Job {},
  Worker: class Worker {},
}));
