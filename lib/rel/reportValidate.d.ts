export type Check = { id: string; name: string; pass: boolean; detail: string };
export function validate(text: string, ctx?: Record<string, unknown>): { pass: boolean; chars: number; checks: Check[] };
