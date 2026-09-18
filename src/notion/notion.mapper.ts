import {
  ProjectStatus,
  RoleName,
  SyncStatus,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';

type NotionProp = Record<string, unknown>;

function asRecord(value: unknown): NotionProp | null {
  return value && typeof value === 'object' ? (value as NotionProp) : null;
}

export function plainTextFromTitle(props: NotionProp, key: string): string {
  const prop = asRecord(props[key]);
  const title = prop?.title;
  if (!Array.isArray(title) || title.length === 0) return '';
  const first = asRecord(title[0]);
  return typeof first?.plain_text === 'string' ? first.plain_text : '';
}

export function plainTextFromRichText(
  props: NotionProp,
  key: string,
): string | null {
  const prop = asRecord(props[key]);
  const rich = prop?.rich_text;
  if (!Array.isArray(rich) || rich.length === 0) return null;
  return (
    rich
      .map((item) => {
        const row = asRecord(item);
        return typeof row?.plain_text === 'string' ? row.plain_text : '';
      })
      .join('')
      .trim() || null
  );
}

export function emailFromProp(props: NotionProp, key: string): string | null {
  const prop = asRecord(props[key]);
  return typeof prop?.email === 'string' ? prop.email : null;
}

export function checkboxFromProp(props: NotionProp, key: string): boolean {
  const prop = asRecord(props[key]);
  return Boolean(prop?.checkbox);
}

export function selectName(props: NotionProp, key: string): string | null {
  const prop = asRecord(props[key]);
  const select = asRecord(prop?.select);
  return typeof select?.name === 'string' ? select.name : null;
}

export function statusName(props: NotionProp, key: string): string | null {
  const prop = asRecord(props[key]);
  const status = asRecord(prop?.status);
  return typeof status?.name === 'string' ? status.name : null;
}

export function dateStart(props: NotionProp, key: string): Date | null {
  const prop = asRecord(props[key]);
  const date = asRecord(prop?.date);
  if (typeof date?.start !== 'string') return null;
  return new Date(date.start);
}

export function dateEnd(props: NotionProp, key: string): Date | null {
  const prop = asRecord(props[key]);
  const date = asRecord(prop?.date);
  if (typeof date?.end !== 'string') return null;
  return new Date(date.end);
}

export function relationIds(props: NotionProp, key: string): string[] {
  const prop = asRecord(props[key]);
  const relation = prop?.relation;
  if (!Array.isArray(relation)) return [];
  return relation
    .map((item) => {
      const row = asRecord(item);
      return typeof row?.id === 'string' ? row.id : null;
    })
    .filter((id): id is string => Boolean(id));
}

export function urlFromProp(props: NotionProp, key: string): string | null {
  const prop = asRecord(props[key]);
  return typeof prop?.url === 'string' ? prop.url : null;
}

export function mapProjectStatus(name: string | null): ProjectStatus {
  switch (name) {
    case 'En ejecución':
      return ProjectStatus.ACTIVE;
    case 'En pausa':
      return ProjectStatus.DELAYED;
    case 'Cerrado':
      return ProjectStatus.COMPLETED;
    case 'Cancelado':
      return ProjectStatus.CANCELLED;
    case 'Planeado':
    default:
      return ProjectStatus.FORMULATION;
  }
}

export function projectStatusToNotion(status: ProjectStatus): string {
  switch (status) {
    case ProjectStatus.ACTIVE:
      return 'En ejecución';
    case ProjectStatus.DELAYED:
      return 'En pausa';
    case ProjectStatus.COMPLETED:
      return 'Cerrado';
    case ProjectStatus.CANCELLED:
      return 'Cancelado';
    case ProjectStatus.FORMULATION:
    default:
      return 'Planeado';
  }
}

export function mapTaskStatus(name: string | null): TaskStatus {
  switch (name) {
    case 'En progreso':
      return TaskStatus.IN_PROGRESS;
    case 'Bloqueada':
      return TaskStatus.BLOCKED;
    case 'Hecha':
      return TaskStatus.DONE;
    case 'Por hacer':
    default:
      return TaskStatus.TODO;
  }
}

export function taskStatusToNotion(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.IN_PROGRESS:
      return 'En progreso';
    case TaskStatus.BLOCKED:
      return 'Bloqueada';
    case TaskStatus.DONE:
      return 'Hecha';
    case TaskStatus.TODO:
    default:
      return 'Por hacer';
  }
}

export function mapTaskPriority(name: string | null): TaskPriority {
  switch (name) {
    case 'Baja':
      return TaskPriority.LOW;
    case 'Alta':
    case 'Urgente':
      return TaskPriority.HIGH;
    case 'Media':
    default:
      return TaskPriority.MEDIUM;
  }
}

export function taskPriorityToNotion(priority: TaskPriority): string {
  switch (priority) {
    case TaskPriority.LOW:
      return 'Baja';
    case TaskPriority.HIGH:
      return 'Alta';
    case TaskPriority.MEDIUM:
    default:
      return 'Media';
  }
}

export function mapRoleName(name: string | null): RoleName {
  switch (name) {
    case 'Coordinador':
      return RoleName.COORDINADOR;
    case 'Administrador':
      return RoleName.ADMINISTRADOR;
    case 'Investigador':
    default:
      return RoleName.INVESTIGADOR;
  }
}

export function roleNameToNotion(role: RoleName): string {
  switch (role) {
    case RoleName.COORDINADOR:
      return 'Coordinador';
    case RoleName.ADMINISTRADOR:
      return 'Administrador';
    case RoleName.INVESTIGADOR:
    default:
      return 'Investigador';
  }
}

export function syncStatusToNotion(status: SyncStatus): string {
  switch (status) {
    case SyncStatus.SYNCED:
      return 'synced';
    case SyncStatus.FAILED:
      return 'failed';
    case SyncStatus.PENDING:
    default:
      return 'pending';
  }
}

export function titleProperty(text: string) {
  return { title: [{ text: { content: text.slice(0, 2000) } }] };
}

export function richTextProperty(text: string | null | undefined) {
  if (!text) return { rich_text: [] };
  return { rich_text: [{ text: { content: text.slice(0, 2000) } }] };
}

export function selectProperty(name: string) {
  return { select: { name } };
}

export function statusProperty(name: string) {
  return { status: { name } };
}

export function emailProperty(email: string) {
  return { email };
}

export function checkboxProperty(value: boolean) {
  return { checkbox: value };
}

export function dateProperty(start: Date | null, end?: Date | null) {
  if (!start) return { date: null };
  return {
    date: {
      start: start.toISOString(),
      end: end ? end.toISOString() : null,
    },
  };
}

export function relationProperty(pageIds: string[]) {
  return { relation: pageIds.map((id) => ({ id })) };
}

export function urlProperty(url: string | null) {
  return { url };
}
