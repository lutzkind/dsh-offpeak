/** Minimal structural view of the DeepSeek Harness Cordis context this plugin uses. */
export interface DshContext {
    on(name: string, listener: (...args: any[]) => any, options?: {
        prepend?: boolean;
    }): () => boolean;
    effect(setup: () => (() => void) | void, label?: string): void;
    provide(name: string, value: unknown): () => void;
    get(name: string): any;
    logger: {
        info(...args: unknown[]): void;
        warn(...args: unknown[]): void;
        error(...args: unknown[]): void;
    };
    commands: {
        register(definition: CommandDefinition): () => void;
    };
}
export interface CommandInvocation {
    agent: {
        session: {
            id: string;
            requestHeader?: () => {
                config: {
                    provider: string;
                    model: string;
                };
            } | undefined;
        };
    };
    rawInput: string;
    signal: AbortSignal;
}
export interface CommandResult {
    kind: 'success' | 'error';
    text: string;
}
export interface CommandDefinition {
    name: string;
    description: string;
    handler(invocation: CommandInvocation): CommandResult | Promise<CommandResult>;
}
export interface AgentRequestPayload {
    agent: {
        session: {
            id: string;
        };
    };
    turn: number;
    step: number;
    signal: AbortSignal;
}
export interface LlmCallConfig {
    provider: string;
    model: string;
    [key: string]: unknown;
}
export interface GenerateOptions {
    provider: string;
    model: string;
    sessionId?: string;
    purpose?: string;
    signal?: AbortSignal;
    [key: string]: unknown;
}
