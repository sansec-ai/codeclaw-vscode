"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSender = createSender;
const types_1 = require("./types");
const logger_1 = require("../logger");
function createSender(api, botAccountId) {
    let clientCounter = 0;
    function generateClientId() {
        return `wcc-${Date.now()}-${++clientCounter}`;
    }
    async function sendText(toUserId, contextToken, text) {
        const clientId = generateClientId();
        const items = [
            {
                type: types_1.MessageItemType.TEXT,
                text_item: { text },
            },
        ];
        const msg = {
            from_user_id: botAccountId,
            to_user_id: toUserId,
            client_id: clientId,
            message_type: types_1.MessageType.BOT,
            message_state: types_1.MessageState.FINISH,
            context_token: contextToken,
            item_list: items,
        };
        logger_1.logger.info('Sending text message', { toUserId, clientId, textLength: text.length });
        await api.sendMessage({ msg });
        logger_1.logger.info('Text message sent', { toUserId, clientId });
    }
    return { sendText };
}
//# sourceMappingURL=send.js.map