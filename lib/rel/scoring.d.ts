// 패키지 원본 scoring.js(로직 변경 없이 그대로 둠)의 타입 선언. 값의 모양은 scoring.js 주석과 같다.
export type Comp = { total: number | null; inner?: number; outer?: number; 속?: number[]; 겉?: number[]; gap?: "inner_higher" | "outer_higher" | null; gapSize?: number; inconsistent?: boolean; unseen?: boolean };
export type Lowest = { mode: "single"; options: string[]; value: string } | { mode: "tie" | "all_high" | "insufficient"; options: string[]; value?: undefined };
export type ModePick = { mode: "single"; value: string; count: Record<string, number>; options?: undefined } | { mode: "confirm"; options: string[]; count?: Record<string, number>; value?: undefined };
export const COMPS: string[];
export const MODES: string[];
export const TH: Record<string, number>;
export function scoreSelf(answers: Record<string, number>, items: unknown[]): { comp: Record<string, Comp & { total: number; inner: number; outer: number }>; lowest: Lowest; inconsistentAll: boolean };
export function pickLowest(comp: Record<string, Comp>, tieBreak: ((c: string) => number) | null): Lowest;
export function neighborOf(comp: Record<string, Comp>, confirmed: string): string | null;
export function pickMode(votes: (string | null)[]): ModePick;
export function typeOf<T extends { name: string; competency: string; mode: string }>(types: T[], competency: string, mode: string, opts?: { relyScore?: number | null; distanceVotes?: number }): T | undefined;
export function scorePartner(answers: Record<string, number | null>, items: unknown[]): { comp: Record<string, Comp>; lowest: Lowest };
export function loopKey(myMode: string, partnerMode: string): string;
export function mismatch(selfComp: Record<string, Comp>, partnerComp: Record<string, Comp>): { competency?: string; diff?: number; key: string };
export function balance(selfComp: Record<string, Comp>, partnerComp: Record<string, Comp>): { key: string; diff: number; badge: boolean } | null;
export function innerOuterLine(selfComp: Record<string, Comp>, confirmed: string): { competency?: string; key: string };
export function safetyFlag(answer: string): boolean;
