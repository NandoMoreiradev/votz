import { Injectable } from '@nestjs/common'
import PDFDocument from 'pdfkit'
import * as QRCode from 'qrcode'
import { loadBundledFonts } from '../common/fonts/fonts.loader'

export interface AccountabilitySnapshot {
  orgType: 'POLITICIAN' | 'ENTITY'
  orgId: string
  orgName: string
  roleOrTypeLabel: string
  territoryLabel: string
  reportTitle?: string
  periodStart: string
  periodEnd: string
  previousPeriodStart: string
  previousPeriodEnd: string
  code: string
  verificationUrl: string
  metrics: {
    received: number
    responded: number
    advocated: number
    resolved: number
    medianResponseHours: number | null
    medianResolutionHours: number | null
    responseRatePercent: number | null
    resolutionRatePercent: number | null
    slaMet?: number
    slaBreached?: number
    slaCompliancePercent?: number | null
    previousReceived: number
    previousResolved: number
    suppressed: boolean
  }
  topCategories: Array<{
    category: string
    receivedCount: number
    resolvedCount: number
  }>
  recurrence?: {
    windowEnd: string | null
    visibleCellsCount: number
    suppressedCellsCount: number
    recurrenceIndexPercent: number | null
    topCells: Array<{
      cell7: string
      category: string
      count90d: number
    }>
  }
  topResolvedReports: Array<{
    title: string
    category: string
    resolvedAt: string
    supportCount: number
  }>
  methodology: {
    dictionaryVersion: string
    dictionaryDate: string
    timezone: string
    computedAt: string
    note: string
  }
}

@Injectable()
export class ReportRendererService {
  async renderAccountabilityPdf(snapshot: AccountabilitySnapshot): Promise<Buffer> {
    const fonts = loadBundledFonts()
    const qrPngBuffer = await QRCode.toBuffer(snapshot.verificationUrl, {
      type: 'png',
      width: 140,
      margin: 1,
      color: { dark: '#1A1A2E', light: '#FFFFFF' },
    })

    const documentHeading =
      snapshot.reportTitle ??
      (snapshot.orgType === 'ENTITY'
        ? 'RELATÓRIO DE ATENDIMENTO — VOTZ'
        : 'PRESTAÇÃO DE CONTAS — VOTZ')

    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title:
          snapshot.orgType === 'ENTITY'
            ? `Relatório de Atendimento Votz — ${snapshot.orgName}`
            : `Prestação de Contas Votz — ${snapshot.orgName}`,
        Author: 'Votz',
        Subject: `Período ${snapshot.periodStart} a ${snapshot.periodEnd} (${snapshot.code})`,
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    const endPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
    })

    doc.registerFont('Heading', fonts.spaceGroteskBold)
    doc.registerFont('Body', fonts.interRegular)
    doc.registerFont('BodyBold', fonts.interSemiBold)
    doc.registerFont('Mono', fonts.jetBrainsMonoRegular)
    doc.registerFont('MonoBold', fonts.jetBrainsMonoBold)

    const pageWidth = doc.page.width - 96

    // Cabeçalho institucional neutro (sem propaganda eleitoral)
    doc
      .fillColor('#1A1A2E')
      .font('Heading')
      .fontSize(20)
      .text(documentHeading, 48, 46, { width: pageWidth - 110 })

    doc
      .fillColor('#475569')
      .font('Body')
      .fontSize(10)
      .text(
        `${snapshot.orgName} · ${snapshot.roleOrTypeLabel} · ${snapshot.territoryLabel}`,
        48,
        74,
        { width: pageWidth - 110 },
      )
      .text(`Período auditado: ${snapshot.periodStart} a ${snapshot.periodEnd}`, 48, 90, {
        width: pageWidth - 110,
      })

    doc
      .font('MonoBold')
      .fontSize(9)
      .fillColor('#1A1A2E')
      .text(`Código: ${snapshot.code}`, 48, 108, { width: pageWidth - 110 })

    doc.image(qrPngBuffer, doc.page.width - 138, 42, { width: 88, height: 88 })

    doc
      .moveTo(48, 140)
      .lineTo(doc.page.width - 48, 140)
      .strokeColor('#E2E8F0')
      .lineWidth(1)
      .stroke()

    // Grade de KPIs factuais
    let y = 156
    doc.font('Heading').fontSize(12).fillColor('#1A1A2E').text('Indicadores do período', 48, y)
    y += 20

    const m = snapshot.metrics
    const thirdCard =
      snapshot.orgType === 'ENTITY' || m.slaCompliancePercent !== undefined
        ? {
            label: 'Cumprimento de prazo (SLA)',
            value:
              m.slaCompliancePercent !== null && m.slaCompliancePercent !== undefined
                ? `${m.slaCompliancePercent}%`
                : '—',
          }
        : { label: 'Avocados', value: String(m.advocated) }

    const kpiCards = [
      { label: 'Relatos no recorte', value: String(m.received) },
      { label: 'Respondidos', value: String(m.responded) },
      thirdCard,
      { label: 'Resolvidos', value: String(m.resolved) },
      {
        label: 'Mediana 1ª resposta',
        value: m.medianResponseHours !== null ? `${m.medianResponseHours}h` : '—',
      },
      {
        label: 'Taxa de resolução',
        value: m.resolutionRatePercent !== null ? `${m.resolutionRatePercent}%` : '—',
      },
    ]

    const cardWidth = (pageWidth - 20) / 3
    kpiCards.forEach((card, idx) => {
      const col = idx % 3
      const row = Math.floor(idx / 3)
      const cx = 48 + col * (cardWidth + 10)
      const cy = y + row * 56
      doc
        .roundedRect(cx, cy, cardWidth, 48, 6)
        .fillAndStroke('#F8FAFC', '#E2E8F0')
      doc
        .fillColor('#64748B')
        .font('Body')
        .fontSize(8)
        .text(card.label, cx + 10, cy + 8, { width: cardWidth - 20 })
      doc
        .fillColor('#1A1A2E')
        .font('MonoBold')
        .fontSize(14)
        .text(card.value, cx + 10, cy + 23, { width: cardWidth - 20 })
    })

    y += 124

    // Comparativo com período anterior
    doc.font('Heading').fontSize(12).fillColor('#1A1A2E').text('Comparativo com o período anterior', 48, y)
    y += 18
    doc
      .font('Body')
      .fontSize(9.5)
      .fillColor('#334155')
      .text(
        `Período anterior (${snapshot.previousPeriodStart} a ${snapshot.previousPeriodEnd}): ${m.previousReceived} relatos na área e ${m.previousResolved} resolvidos.`,
        48,
        y,
        { width: pageWidth },
      )
    y += 28

    // Categorias principais
    doc.font('Heading').fontSize(12).fillColor('#1A1A2E').text('Principais categorias na área', 48, y)
    y += 18
    if (snapshot.topCategories.length === 0) {
      doc
        .font('Body')
        .fontSize(9)
        .fillColor('#64748B')
        .text('Sem categorias registradas no período selecionado.', 48, y)
      y += 20
    } else {
      for (const cat of snapshot.topCategories.slice(0, 6)) {
        doc
          .font('BodyBold')
          .fontSize(9)
          .fillColor('#1A1A2E')
          .text(cat.category, 48, y, { width: 220, continued: false })
        doc
          .font('Mono')
          .fontSize(9)
          .fillColor('#334155')
          .text(`Recebidos: ${cat.receivedCount}   ·   Resolvidos: ${cat.resolvedCount}`, 270, y, {
            width: pageWidth - 222,
          })
        y += 16
      }
      y += 10
    }

    if (snapshot.recurrence) {
      doc.font('Heading').fontSize(12).fillColor('#1A1A2E').text('Reincidência por área (janela 90d)', 48, y)
      y += 18
      const rec = snapshot.recurrence
      const recSummary =
        rec.recurrenceIndexPercent !== null
          ? `Índice de reincidência: ${rec.recurrenceIndexPercent}% · Células visíveis (>= 10): ${rec.visibleCellsCount} · Suprimidas (< 10): ${rec.suppressedCellsCount}`
          : `Células visíveis (>= 10): ${rec.visibleCellsCount} · Suprimidas por privacidade (< 10): ${rec.suppressedCellsCount}`
      doc.font('Body').fontSize(9).fillColor('#334155').text(recSummary, 48, y, { width: pageWidth })
      y += 16
      for (const cell of rec.topCells.slice(0, 4)) {
        if (y > doc.page.height - 200) break
        doc
          .font('Mono')
          .fontSize(8.5)
          .fillColor('#475569')
          .text(`${cell.category} · região ${cell.cell7}: ${cell.count90d} ocorrências em 90d`, 56, y, {
            width: pageWidth - 16,
          })
        y += 14
      }
      y += 8
    }

    // Relatos resolvidos com maior apoio (somente título e data; zero dados pessoais)
    doc
      .font('Heading')
      .fontSize(12)
      .fillColor('#1A1A2E')
      .text('Relatos resolvidos de maior apoio (sem dados pessoais)', 48, y)
    y += 18

    if (snapshot.topResolvedReports.length === 0) {
      doc
        .font('Body')
        .fontSize(9)
        .fillColor('#64748B')
        .text('Nenhum relato resolvido registrado no recorte deste período.', 48, y)
      y += 20
    } else {
      for (const item of snapshot.topResolvedReports.slice(0, 8)) {
        if (y > doc.page.height - 140) break
        const cleanTitle = item.title.replace(/\s+/g, ' ').trim().slice(0, 82)
        doc
          .font('Body')
          .fontSize(9)
          .fillColor('#1A1A2E')
          .text(`• ${cleanTitle}`, 48, y, { width: pageWidth - 150 })
        doc
          .font('Mono')
          .fontSize(8.5)
          .fillColor('#64748B')
          .text(`${item.resolvedAt} · ${item.supportCount} apoios`, doc.page.width - 195, y, {
            width: 147,
            align: 'right',
          })
        y += 16
      }
    }

    // Rodapé fixo de metodologia e autenticidade
    const footerY = doc.page.height - 108
    doc
      .moveTo(48, footerY)
      .lineTo(doc.page.width - 48, footerY)
      .strokeColor('#E2E8F0')
      .lineWidth(1)
      .stroke()

    doc
      .font('Mono')
      .fontSize(8)
      .fillColor('#475569')
      .text(
        `Metodologia: Dicionário Votz ${snapshot.methodology.dictionaryVersion} (${snapshot.methodology.dictionaryDate}) · Fuso ${snapshot.methodology.timezone} · Calculado em ${snapshot.methodology.computedAt}`,
        48,
        footerY + 8,
        { width: pageWidth },
      )
      .text(
        `Verificação pública imutável: ${snapshot.verificationUrl} · Código ${snapshot.code}`,
        48,
        footerY + 24,
        { width: pageWidth },
      )
    doc
      .font('Body')
      .fontSize(7.5)
      .fillColor('#64748B')
      .text(snapshot.methodology.note, 48, footerY + 40, { width: pageWidth })

    doc.end()
    return endPromise
  }
}
