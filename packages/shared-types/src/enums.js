"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoteType = exports.CompanyPlan = exports.CompanySize = exports.CompanySector = exports.RecipientType = exports.EntityType = exports.Category = exports.EventType = exports.ReportStatus = exports.UserType = void 0;
var UserType;
(function (UserType) {
    UserType["CITIZEN"] = "CITIZEN";
    UserType["ENTITY"] = "ENTITY";
    UserType["POLITICIAN"] = "POLITICIAN";
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
//# sourceMappingURL=enums.js.map