import { WeChatApi } from './api';
export declare function createSender(api: WeChatApi, botAccountId: string): {
    sendText: (toUserId: string, contextToken: string, text: string) => Promise<void>;
};
