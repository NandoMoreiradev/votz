"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONVERSATION_REPORT_REASONS = exports.DEFAULT_CONVERSATION_SETTINGS = void 0;
exports.conversationFontSize = conversationFontSize;
exports.conversationTime = conversationTime;
exports.conversationUnreadLabel = conversationUnreadLabel;
exports.conversationMemberLabel = conversationMemberLabel;
exports.conversationTitle = conversationTitle;
exports.conversationIsMuted = conversationIsMuted;
exports.conversationTypingLabel = conversationTypingLabel;
exports.conversationLastSeenLabel = conversationLastSeenLabel;
exports.conversationHeaderStatus = conversationHeaderStatus;
exports.DEFAULT_CONVERSATION_SETTINGS = {
    readReceiptsEnabled: false,
    lastSeenVisibility: 'CONTACTS',
    groupInvitePolicy: 'EVERYONE',
    directRequestPolicy: 'EVERYONE',
    notifySound: true,
    notifyVibration: true,
    notifyPreview: false,
    securityAlertsEnabled: true,
    keyBackupEnabled: false,
    mediaAutoDownload: 'WIFI_ONLY',
    fontScale: 'MEDIUM',
    wallpaper: 'DEFAULT',
};
function conversationFontSize(scale) {
    if (scale === 'SMALL')
        return 13;
    if (scale === 'LARGE')
        return 18;
    return 15;
}
exports.CONVERSATION_REPORT_REASONS = [
    { value: 'OFFENSIVE', label: 'Ofensa ou assédio' },
    { value: 'SPAM_OR_ADS', label: 'Spam ou golpe' },
    { value: 'SEXUAL_OR_VIOLENT', label: 'Conteúdo violento ou impróprio' },
    { value: 'FAKE_PROFILE', label: 'Perfil falso ou se passando por alguém' },
    { value: 'PERSONAL_DATA', label: 'Exposição de dados pessoais' },
    { value: 'OTHER', label: 'Outro motivo' },
];
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
function conversationIsMuted(mutedUntil, now = new Date()) {
    if (!mutedUntil)
        return false;
    const until = new Date(mutedUntil);
    return !Number.isNaN(until.getTime()) && until.getTime() > now.getTime();
}
function conversationTypingLabel(names) {
    const unique = names.map((n) => n.trim().split(' ')[0]).filter(Boolean);
    if (!unique.length)
        return '';
    if (unique.length === 1)
        return `${unique[0]} está digitando...`;
    if (unique.length === 2)
        return `${unique[0]} e ${unique[1]} estão digitando...`;
    return 'Várias pessoas estão digitando...';
}
/** "Visto por último hoje às 21:40", "…ontem às 21:40" ou "…em 18/11/26". */
function conversationLastSeenLabel(iso, now = new Date()) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime()))
        return '';
    const day = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((day(now) - day(at)) / 86_400_000);
    const time = at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (days <= 0)
        return `Visto por último hoje às ${time}`;
    if (days === 1)
        return `Visto por último ontem às ${time}`;
    return `Visto por último em ${at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
}
/**
 * Linha abaixo do nome no cabeçalho da conversa, igual no web e no celular:
 * "digitando…" (destacado), número de participantes, visto por último ou, sem
 * essa informação, o aviso de que a conversa é protegida.
 */
function conversationHeaderStatus(conversation, typingNames, now = new Date()) {
    if (typingNames.length > 0)
        return { text: conversationTypingLabel(typingNames), typing: true };
    if (conversation.kind === 'GROUP')
        return { text: conversationMemberLabel(conversation.memberCount), typing: false };
    const seen = conversation.peerLastSeenAt
        ? conversationLastSeenLabel(conversation.peerLastSeenAt, now)
        : '';
    return { text: seen || 'Protegida de ponta a ponta', typing: false };
}
//# sourceMappingURL=conversation.js.map