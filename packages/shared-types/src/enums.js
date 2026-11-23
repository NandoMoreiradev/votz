"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlagStatus = exports.SuggestionStatus = exports.SuggestionCategory = exports.FlagReason = exports.PostCommentMediaType = exports.PostKind = exports.FlagTargetType = exports.ModerationActionType = exports.VoteType = exports.CompanyPlan = exports.CompanySize = exports.CompanySector = exports.RecipientType = exports.EntityType = exports.Category = exports.EventType = exports.ReportStatus = exports.UserType = void 0;
var UserType;
(function (UserType) {
    UserType["CITIZEN"] = "CITIZEN";
    UserType["ENTITY"] = "ENTITY";
    UserType["POLITICIAN"] = "POLITICIAN";
    UserType["COMPANY"] = "COMPANY";
    UserType["PRESS"] = "PRESS";
    UserType["NGO"] = "NGO";
    UserType["RESEARCHER"] = "RESEARCHER";
    UserType["MODERATOR"] = "MODERATOR";
    UserType["ADMIN"] = "ADMIN";
})(UserType || (exports.UserType = UserType = {}));
var ReportStatus;
(function (ReportStatus) {
    ReportStatus["OPEN"] = "OPEN";
    ReportStatus["UNDER_REVIEW"] = "UNDER_REVIEW";
    ReportStatus["IN_PROGRESS"] = "IN_PROGRESS";
    ReportStatus["RESOLVED"] = "RESOLVED";
    ReportStatus["DISPUTED"] = "DISPUTED";
    ReportStatus["ARCHIVED"] = "ARCHIVED";
})(ReportStatus || (exports.ReportStatus = ReportStatus = {}));
var EventType;
(function (EventType) {
    EventType["CREATED"] = "CREATED";
    EventType["RESPONDED"] = "RESPONDED";
    EventType["STATUS_CHANGED"] = "STATUS_CHANGED";
    EventType["UPDATE"] = "UPDATE";
    EventType["DISPUTED"] = "DISPUTED";
    EventType["RESOLVED"] = "RESOLVED";
    EventType["ARCHIVED"] = "ARCHIVED";
})(EventType || (exports.EventType = EventType = {}));
var Category;
(function (Category) {
    Category["HEALTH"] = "HEALTH";
    Category["MOBILITY"] = "MOBILITY";
    Category["SAFETY"] = "SAFETY";
    Category["EDUCATION"] = "EDUCATION";
    Category["SANITATION"] = "SANITATION";
    Category["HOUSING"] = "HOUSING";
    Category["ENVIRONMENT"] = "ENVIRONMENT";
    Category["INFRASTRUCTURE"] = "INFRASTRUCTURE";
    Category["URBAN_SERVICES"] = "URBAN_SERVICES";
    Category["CORRUPTION"] = "CORRUPTION";
    Category["ACCESSIBILITY"] = "ACCESSIBILITY";
    Category["SOCIAL_WELFARE"] = "SOCIAL_WELFARE";
    Category["OTHER"] = "OTHER";
})(Category || (exports.Category = Category = {}));
var EntityType;
(function (EntityType) {
    EntityType["CITY_HALL"] = "CITY_HALL";
    EntityType["HOSPITAL"] = "HOSPITAL";
    EntityType["CONCESSIONAIRE"] = "CONCESSIONAIRE";
    EntityType["AUTARCHY"] = "AUTARCHY";
    EntityType["SECRETARIAT"] = "SECRETARIAT";
    EntityType["OTHER"] = "OTHER";
})(EntityType || (exports.EntityType = EntityType = {}));
var RecipientType;
(function (RecipientType) {
    RecipientType["ENTITY"] = "ENTITY";
    RecipientType["COMPANY"] = "COMPANY";
    RecipientType["BRANCH"] = "BRANCH";
    RecipientType["POLITICIAN"] = "POLITICIAN";
})(RecipientType || (exports.RecipientType = RecipientType = {}));
var CompanySector;
(function (CompanySector) {
    CompanySector["TELECOM"] = "TELECOM";
    CompanySector["SUPPLEMENTAL_HEALTH"] = "SUPPLEMENTAL_HEALTH";
    CompanySector["FINANCIAL"] = "FINANCIAL";
    CompanySector["ENERGY"] = "ENERGY";
    CompanySector["TRANSPORTATION"] = "TRANSPORTATION";
    CompanySector["RETAIL"] = "RETAIL";
    CompanySector["FOOD"] = "FOOD";
    CompanySector["CONDOMINIUM"] = "CONDOMINIUM";
    CompanySector["OTHER"] = "OTHER";
})(CompanySector || (exports.CompanySector = CompanySector = {}));
var CompanySize;
(function (CompanySize) {
    CompanySize["MEI"] = "MEI";
    CompanySize["SMALL"] = "SMALL";
    CompanySize["MEDIUM"] = "MEDIUM";
    CompanySize["LARGE"] = "LARGE";
})(CompanySize || (exports.CompanySize = CompanySize = {}));
var CompanyPlan;
(function (CompanyPlan) {
    CompanyPlan["STARTER"] = "STARTER";
    CompanyPlan["BUSINESS"] = "BUSINESS";
    CompanyPlan["ENTERPRISE"] = "ENTERPRISE";
    CompanyPlan["WHITE_LABEL"] = "WHITE_LABEL";
})(CompanyPlan || (exports.CompanyPlan = CompanyPlan = {}));
var VoteType;
(function (VoteType) {
    VoteType["SUPPORT"] = "SUPPORT";
    VoteType["ME_TOO"] = "ME_TOO";
})(VoteType || (exports.VoteType = VoteType = {}));
var ModerationActionType;
(function (ModerationActionType) {
    ModerationActionType["REPORT_REMOVED"] = "REPORT_REMOVED";
    ModerationActionType["COMMENT_REMOVED"] = "COMMENT_REMOVED";
    ModerationActionType["POST_REMOVED"] = "POST_REMOVED";
    ModerationActionType["POST_COMMENT_REMOVED"] = "POST_COMMENT_REMOVED";
    ModerationActionType["USER_BANNED"] = "USER_BANNED";
    ModerationActionType["USER_UNBANNED"] = "USER_UNBANNED";
    ModerationActionType["USER_TYPE_CHANGED"] = "USER_TYPE_CHANGED";
    ModerationActionType["API_KEY_TIER_CHANGED"] = "API_KEY_TIER_CHANGED";
    ModerationActionType["ORG_ITEM_CREATED"] = "ORG_ITEM_CREATED";
    ModerationActionType["ORG_ITEM_DELETED"] = "ORG_ITEM_DELETED";
    ModerationActionType["CONTEXT_NOTE_REMOVED"] = "CONTEXT_NOTE_REMOVED";
})(ModerationActionType || (exports.ModerationActionType = ModerationActionType = {}));
var FlagTargetType;
(function (FlagTargetType) {
    FlagTargetType["REPORT"] = "REPORT";
    FlagTargetType["COMMENT"] = "COMMENT";
    FlagTargetType["POST"] = "POST";
    FlagTargetType["POST_COMMENT"] = "POST_COMMENT";
    FlagTargetType["CONTEXT_NOTE"] = "CONTEXT_NOTE";
})(FlagTargetType || (exports.FlagTargetType = FlagTargetType = {}));
var PostKind;
(function (PostKind) {
    PostKind["STANDARD"] = "STANDARD";
    PostKind["ADVOCACY"] = "ADVOCACY";
    PostKind["POLL"] = "POLL";
    PostKind["QUOTE"] = "QUOTE";
})(PostKind || (exports.PostKind = PostKind = {}));
var PostCommentMediaType;
(function (PostCommentMediaType) {
    PostCommentMediaType["TEXT"] = "TEXT";
    PostCommentMediaType["IMAGE"] = "IMAGE";
    PostCommentMediaType["GIF"] = "GIF";
    PostCommentMediaType["AUDIO"] = "AUDIO";
})(PostCommentMediaType || (exports.PostCommentMediaType = PostCommentMediaType = {}));
var FlagReason;
(function (FlagReason) {
    FlagReason["FALSE_INFO"] = "FALSE_INFO";
    FlagReason["OFFENSIVE"] = "OFFENSIVE";
    FlagReason["PERSONAL_DATA"] = "PERSONAL_DATA";
    FlagReason["SEXUAL_OR_VIOLENT"] = "SEXUAL_OR_VIOLENT";
    FlagReason["SPAM_OR_ADS"] = "SPAM_OR_ADS";
    FlagReason["FAKE_PROFILE"] = "FAKE_PROFILE";
    FlagReason["COPYRIGHT"] = "COPYRIGHT";
    FlagReason["OTHER"] = "OTHER";
})(FlagReason || (exports.FlagReason = FlagReason = {}));
var SuggestionCategory;
(function (SuggestionCategory) {
    SuggestionCategory["FEATURE"] = "FEATURE";
    SuggestionCategory["IMPROVEMENT"] = "IMPROVEMENT";
    SuggestionCategory["BUG"] = "BUG";
    SuggestionCategory["UX"] = "UX";
    SuggestionCategory["OTHER"] = "OTHER";
})(SuggestionCategory || (exports.SuggestionCategory = SuggestionCategory = {}));
var SuggestionStatus;
(function (SuggestionStatus) {
    SuggestionStatus["OPEN"] = "OPEN";
    SuggestionStatus["UNDER_REVIEW"] = "UNDER_REVIEW";
    SuggestionStatus["PLANNED"] = "PLANNED";
    SuggestionStatus["IN_PROGRESS"] = "IN_PROGRESS";
    SuggestionStatus["COMPLETED"] = "COMPLETED";
    SuggestionStatus["DECLINED"] = "DECLINED";
})(SuggestionStatus || (exports.SuggestionStatus = SuggestionStatus = {}));
var FlagStatus;
(function (FlagStatus) {
    FlagStatus["OPEN"] = "OPEN";
    FlagStatus["ACTIONED"] = "ACTIONED";
    FlagStatus["DISMISSED"] = "DISMISSED";
})(FlagStatus || (exports.FlagStatus = FlagStatus = {}));
//# sourceMappingURL=enums.js.map