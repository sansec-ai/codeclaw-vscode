import type { MessageItem } from './types';
export declare function downloadImage(item: MessageItem): Promise<string | null>;
export declare function extractText(item: MessageItem): string;
export declare function extractFirstImageUrl(items?: MessageItem[]): MessageItem | undefined;
