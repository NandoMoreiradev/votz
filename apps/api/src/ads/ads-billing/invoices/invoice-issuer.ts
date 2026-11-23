import { Injectable, ServiceUnavailableException } from '@nestjs/common'

export interface InvoiceRequest {
  invoiceId: string
  /** Quem recebe a nota (a empresa anunciante). */
  takerName: string
  takerCnpj: string
  amountCents: number
  /** Mês de competência, "AAAA-MM-DD" do primeiro e do último dia. */
  periodStart: string
  periodEnd: string
  description: string
}

export interface InvoiceResult {
  externalId: string
  number: string
  pdfUrl?: string | null
  xmlUrl?: string | null
}

/**
 * Quem emite a nota fiscal de serviço (NFS-e). A tela e o livro-caixa não sabem qual é: só pedem a emissão. A emissão de
 * verdade depende da prefeitura e de um provedor (Asaas, eNotas, Focus NFe...), que o dono ainda vai escolher.
 */
export interface InvoiceIssuer {
  readonly provider: string
  /** Está configurado e implementado? Se não, as notas ficam esperando (sem contar tentativa). */
  isReady(): boolean
  issue(request: InvoiceRequest): Promise<InvoiceResult>
}

/** Modo de teste: gera um número falso, sem nota de verdade e sem arquivo. Nunca vale como documento fiscal. */
@Injectable()
export class TestInvoiceIssuer implements InvoiceIssuer {
  readonly provider = 'TEST'

  isReady(): boolean {
    return true
  }

  async issue(request: InvoiceRequest): Promise<InvoiceResult> {
    return { externalId: `test_${request.invoiceId}`, number: `TESTE-${request.periodStart.slice(0, 7).replace('-', '')}-${request.invoiceId.slice(0, 6)}`, pdfUrl: null, xmlUrl: null }
  }
}

/** Provedor real de NFS-e. Falta escolher o provedor e a conta do dono; até lá a emissão fica esperando. */
@Injectable()
export class LiveInvoiceIssuer implements InvoiceIssuer {
  readonly provider = 'NFSE'

  isReady(): boolean {
    return false
  }

  async issue(_request: InvoiceRequest): Promise<InvoiceResult> {
    throw new ServiceUnavailableException('A emissão de nota fiscal ainda não está ligada.')
  }
}
