/** Small durable state document for the host control toggle and session overrides. */
export interface SessionProtectionRecord {
    protection: 'off';
    updatedAt: number;
}
export interface OffpeakState {
    version: 1;
    enabled: boolean;
    sessions: Record<string, SessionProtectionRecord>;
}
export declare function resolveDshHome(env?: NodeJS.ProcessEnv): string;
export declare function defaultOffpeakState(): OffpeakState;
/** One atomic JSON document under `$DSH_HOME/offpeak/state.json`. */
export declare class OffpeakStateStore {
    readonly path: string;
    private state;
    private writeChain;
    constructor(path?: string);
    load(): Promise<OffpeakState>;
    current(): OffpeakState;
    update(change: (state: OffpeakState) => OffpeakState): Promise<OffpeakState>;
    private write;
    flush(): Promise<void>;
}
