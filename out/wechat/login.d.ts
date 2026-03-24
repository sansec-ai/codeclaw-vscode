import type { AccountData } from './accounts';
export declare function startQrLogin(): Promise<{
    qrcodeUrl: string;
    qrcodeId: string;
}>;
export declare function waitForQrScan(qrcodeId: string, signal?: AbortSignal): Promise<AccountData>;
