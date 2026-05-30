import { Category } from './enums';
export declare enum PropostaStatus {
    DRAFT = "DRAFT",
    PRESENTED = "PRESENTED",
    IN_VOTE = "IN_VOTE",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
    ARCHIVED = "ARCHIVED"
}
export declare enum PropostaEventType {
    CREATED = "CREATED",
    STATUS_CHANGED = "STATUS_CHANGED",
    UPDATED = "UPDATED"
}
export interface PublicProposta {
    id: string;
    titulo: string;
    descricao: string;
    status: PropostaStatus;
    categorias: Category[];
    politicoId: string;
    linkExterno?: string;
    totalApoios: number;
    totalRejeicoes: number;
    createdAt: string;
    updatedAt: string;
    politico?: {
        id: string;
        name: string;
        office: string;
        avatarUrl?: string | null;
        party: {
            abbreviation: string;
            name: string;
        };
    };
}
export interface PropostaTimelineEvent {
    id: string;
    tipo: PropostaEventType;
    conteudo: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
    autor?: {
        id: string;
        name: string;
        avatarUrl?: string | null;
    };
}
//# sourceMappingURL=proposta.d.ts.map