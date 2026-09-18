import {
  mapProjectStatus,
  mapTaskPriority,
  mapTaskStatus,
  projectStatusToNotion,
  taskPriorityToNotion,
  taskStatusToNotion,
} from './notion.mapper';
import { ProjectStatus, TaskPriority, TaskStatus } from '@prisma/client';

describe('NotionMapper', () => {
  it('maps project statuses both ways', () => {
    expect(mapProjectStatus('En ejecución')).toBe(ProjectStatus.ACTIVE);
    expect(mapProjectStatus('Planeado')).toBe(ProjectStatus.FORMULATION);
    expect(projectStatusToNotion(ProjectStatus.DELAYED)).toBe('En pausa');
  });

  it('maps task statuses both ways', () => {
    expect(mapTaskStatus('Bloqueada')).toBe(TaskStatus.BLOCKED);
    expect(taskStatusToNotion(TaskStatus.DONE)).toBe('Hecha');
  });

  it('maps priorities with Urgente as HIGH', () => {
    expect(mapTaskPriority('Urgente')).toBe(TaskPriority.HIGH);
    expect(taskPriorityToNotion(TaskPriority.LOW)).toBe('Baja');
  });
});
