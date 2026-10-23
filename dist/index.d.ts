/**
 * DeepSeek Harness native off-peak guard.
 *
 * The agent loop's `agent/request` waterfall parks a paid step before the
 * provider attempt exists; the LLM service's `llm/stream` waterfall covers
 * direct auxiliary calls such as compaction. Both wait on one boundary timer
 * and a shared wake signal, never on a polling loop.
 */
import type { DshContext } from './types.js';
export declare const name = "dsh-offpeak";
export declare const inject: string[];
export interface Config {
    enabled?: boolean;
    displayTimeZone?: string;
    statePath?: string;
}
export declare function apply(ctx: DshContext, rawConfig?: unknown): Promise<void>;
