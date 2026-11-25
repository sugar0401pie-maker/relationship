export const PAID_FIELDS: string[];
export const FREE_FIELDS: string[];
export const UNRESOLVED_RE: RegExp;
type S = { nickname: string; relationship: string; answers: Record<string, unknown>; result: unknown };
export function makeReportBuilder(x: { DATA: unknown; PROMPT_DOC: string; SAMPLES_DOC: string }): {
  buildRequest(s: S): { system: string; user: string };
  buildContext(s: S): Record<string, unknown>;
  pickNotable(answers: Record<string, unknown>, r: unknown): number[];
  renderSystem(nickname: string): string;
};
