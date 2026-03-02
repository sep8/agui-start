export type OJNode =
  | { type: 'page'; children: OJNode[] }
  | { type: 'card'; title?: string; children: OJNode[] }
  | { type: 'text'; value: string }
  | { type: 'button'; label: string; action?: { type: 'alert'; message: string } }
