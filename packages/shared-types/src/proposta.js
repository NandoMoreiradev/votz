"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PropostaEventType = exports.PropostaStatus = void 0;
var PropostaStatus;
(function (PropostaStatus) {
    PropostaStatus["DRAFT"] = "DRAFT";
    PropostaStatus["PRESENTED"] = "PRESENTED";
    PropostaStatus["IN_VOTE"] = "IN_VOTE";
    PropostaStatus["APPROVED"] = "APPROVED";
    PropostaStatus["REJECTED"] = "REJECTED";
    PropostaStatus["ARCHIVED"] = "ARCHIVED";
})(PropostaStatus || (exports.PropostaStatus = PropostaStatus = {}));
var PropostaEventType;
(function (PropostaEventType) {
    PropostaEventType["CREATED"] = "CREATED";
    PropostaEventType["STATUS_CHANGED"] = "STATUS_CHANGED";
    PropostaEventType["UPDATED"] = "UPDATED";
})(PropostaEventType || (exports.PropostaEventType = PropostaEventType = {}));
//# sourceMappingURL=proposta.js.map