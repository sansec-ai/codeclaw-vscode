export interface QueryOptions {
    prompt: string;
    cwd: string;
    resume?: string;
    model?: string;
    permissionMode?: string;
    images?: Array<{
        type: "image";
        source: {
            type: "base64";
            media_type: string;
            data: string;
        };
    }>;
}
export interface QueryResult {
    text: string;
    sessionId: string;
    error?: string;
}
/**
 * Call Claude Code CLI to process a prompt.
 * Uses `claude -p <prompt> --output-format text` for non-interactive mode.
 */
export declare function claudeQuery(options: QueryOptions): Promise<QueryResult>;
