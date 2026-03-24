export declare const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export declare const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
export interface AccountData {
    botToken: string;
    accountId: string;
    baseUrl: string;
    userId: string;
    createdAt: string;
}
export declare function saveAccount(data: AccountData): void;
export declare function loadAccount(accountId: string): AccountData | null;
export declare function loadLatestAccount(): AccountData | null;
