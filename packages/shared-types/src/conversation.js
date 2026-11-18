"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationMemberLabel = conversationMemberLabel;
exports.conversationTitle = conversationTitle;
function conversationMemberLabel(count) {
    return `${count} ${count === 1 ? 'participante' : 'participantes'}`;
}
function conversationTitle(conversation, userId) {
    return conversation.kind === 'GROUP'
        ? conversation.title || 'Grupo'
        : conversation.members.find((member) => member.user.id !== userId)?.user.name || 'Conversa';
}
//# sourceMappingURL=conversation.js.map