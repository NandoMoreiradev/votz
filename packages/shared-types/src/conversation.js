"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationTime = conversationTime;
exports.conversationUnreadLabel = conversationUnreadLabel;
exports.conversationMemberLabel = conversationMemberLabel;
exports.conversationTitle = conversationTitle;
/** Horário na lista: hora se for hoje, "Ontem", ou a data. Igual no web e no mobile. */
function conversationTime(iso, now = new Date()) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime()))
        return '';
    const day = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((day(now) - day(at)) / 86_400_000);
    if (days <= 0)
        return at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (days === 1)
        return 'Ontem';
    return at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
/** "3", "99+" — o contador de não lidas como aparece no selo. */
function conversationUnreadLabel(count) {
    return count > 99 ? '99+' : String(Math.max(0, Math.floor(count)));
}
function conversationMemberLabel(count) {
    return `${count} ${count === 1 ? 'participante' : 'participantes'}`;
}
function conversationTitle(conversation, userId) {
    return conversation.kind === 'GROUP'
        ? conversation.title || 'Grupo'
        : conversation.members.find((member) => member.user.id !== userId)?.user.name || 'Conversa';
}
//# sourceMappingURL=conversation.js.map