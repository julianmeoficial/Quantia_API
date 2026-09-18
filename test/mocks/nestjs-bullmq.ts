import { Inject } from '@nestjs/common';

const queueStub = {
  add: () => Promise.resolve({ id: 'job-1' }),
};

export function getQueueToken(name: string): string {
  return `BullQueue_${name}`;
}

export const InjectQueue = (name?: string): ParameterDecorator =>
  Inject(getQueueToken(name ?? 'notion-sync'));

export const Processor = () => (cls: unknown) => cls;

export class WorkerHost {
  process(): Promise<void> {
    return Promise.resolve();
  }
}

export const BullModule = {
  forRoot: () => ({
    module: class MockBullRoot {},
    global: true,
  }),
  forRootAsync: () => ({
    module: class MockBullRootAsync {},
    global: true,
  }),
  registerQueue: (opts: { name: string }) => ({
    module: class MockBullQueue {},
    providers: [
      {
        provide: getQueueToken(opts.name),
        useValue: queueStub,
      },
    ],
    exports: [getQueueToken(opts.name)],
  }),
};
