import { WeChatApi } from './api';
import type { WeixinMessage } from './types';
export interface MonitorCallbacks {
    onMessage: (msg: WeixinMessage) => Promise<void>;
    onSessionExpired: () => void;
}
export declare function createMonitor(api: WeChatApi, callbacks: MonitorCallbacks): {
    run: () => Promise<void>;
    stop: () => void;
};
