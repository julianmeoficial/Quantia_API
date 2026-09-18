export class Queue {
  add = () => Promise.resolve({ id: 'job-1' });
}
export class Job {}
export class Worker {}
