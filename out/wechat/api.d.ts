import type { GetUpdatesResp, SendMessageReq, GetUploadUrlResp } from './types';
export declare class WeChatApi {
    private readonly token;
    private readonly baseUrl;
    private readonly uin;
    constructor(token: string, baseUrl?: string);
    private headers;
    private request;
    getUpdates(buf?: string): Promise<GetUpdatesResp>;
    sendMessage(req: SendMessageReq): Promise<void>;
    getUploadUrl(fileType: string, fileSize: number, fileName: string): Promise<GetUploadUrlResp>;
}
