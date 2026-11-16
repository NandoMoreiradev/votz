import { Injectable } from '@nestjs/common'
import { getCategoryLabel } from '@votz/shared-types'
import PDFDocument from 'pdfkit'
import * as QRCode from 'qrcode'
import {
  formatCountPtBr,
  formatDateBr,
  formatDateTimeBr,
  formatDurationPtBr,
  formatPercentPtBr,
  truncateWithEllipsis,
  VOTZ_BRAND_COLORS,
} from '../common/branding/votz-visual'
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
      cell7?: string
      areaLabel?: string
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
      width: 240,
      margin: 1,
      color: { dark: VOTZ_BRAND_COLORS.primary, light: VOTZ_BRAND_COLORS.white },
    })

    const documentHeading =
      snapshot.reportTitle ??
      (snapshot.orgType === 'ENTITY'
        ? 'RELATÓRIO DE ATENDIMENTO — VOTZ'
        : 'PRESTAÇÃO DE CONTAS — VOTZ')

    const periodLabel = `${formatDateBr(snapshot.periodStart)} a ${formatDateBr(snapshot.periodEnd)}`
    const previousPeriodLabel = `${formatDateBr(snapshot.previousPeriodStart)} a ${formatDateBr(snapshot.previousPeriodEnd)}`

    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title:
          snapshot.orgType === 'ENTITY'
            ? `Relatório de Atendimento Votz — ${snapshot.orgName}`
            : `Prestação de Contas Votz — ${snapshot.orgName}`,
        Author: 'Votz',
        Subject: `Período ${periodLabel} (${snapshot.code})`,
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
    const headerTextWidth = pageWidth - 108

    // Barra institucional superior Votz
    doc.rect(48, 36, 40, 4).fill(VOTZ_BRAND_COLORS.action)

    // Cabeçalho institucional neutro (sem propaganda eleitoral)
    doc
      .fillColor(VOTZ_BRAND_COLORS.primary)
      .font('Heading')
      .fontSize(19)
      .text(truncateWithEllipsis(documentHeading, 46), 48, 46, { width: headerTextWidth })

    const orgLineY = Math.max(72, doc.y + 4)
    doc
      .fillColor(VOTZ_BRAND_COLORS.muted)
      .font('Body')
      .fontSize(10)
      .text(
        truncateWithEllipsis(
          `${snapshot.orgName} · ${snapshot.roleOrTypeLabel} · ${snapshot.territoryLabel}`,
          120,
        ),
        48,
        orgLineY,
        { width: headerTextWidth },
      )

    const periodLineY = Math.max(89, doc.y + 3)
    doc
      .fillColor(VOTZ_BRAND_COLORS.text)
      .font('Body')
      .fontSize(10)
      .text(`Período auditado: ${periodLabel}`, 48, periodLineY, {
        width: headerTextWidth,
      })

    const codeLineY = Math.max(107, doc.y + 4)
    doc
      .font('MonoBold')
      .fontSize(9)
      .fillColor(VOTZ_BRAND_COLORS.primary)
      .text(`Código: ${snapshot.code}`, 48, codeLineY, { width: headerTextWidth })

    doc.image(qrPngBuffer, doc.page.width - 136, 40, { width: 88, height: 88 })

    const dividerY = Math.max(138, doc.y + 12)
    doc
      .moveTo(48, dividerY)
      .lineTo(doc.page.width - 48, dividerY)
      .strokeColor(VOTZ_BRAND_COLORS.border)
      .lineWidth(1)
      .stroke()

    // Grade de KPIs factuais
    let y = dividerY + 14
    doc
      .font('Heading')
      .fontSize(12)
      .fillColor(VOTZ_BRAND_COLORS.primary)
      .text('Indicadores do período', 48, y)
    y += 19

    const m = snapshot.metrics
    const thirdCard =
      snapshot.orgType === 'ENTITY' || m.slaCompliancePercent !== undefined
        ? {
            label: 'Cumprimento de prazo (SLA)',
            value: formatPercentPtBr(m.slaCompliancePercent),
            accent: VOTZ_BRAND_COLORS.positive,
          }
        : {
            label: 'Avocados',
            value: formatCountPtBr(m.advocated),
            accent: VOTZ_BRAND_COLORS.primary,
          }

    const kpiCards = [
      {
        label: 'Relatos no recorte',
        value: formatCountPtBr(m.received),
        accent: VOTZ_BRAND_COLORS.primary,
      },
      {
        label: 'Respondidos',
        value: formatCountPtBr(m.responded),
        accent: VOTZ_BRAND_COLORS.primary,
      },
      thirdCard,
      {
        label: 'Resolvidos',
        value: formatCountPtBr(m.resolved),
        accent: VOTZ_BRAND_COLORS.positive,
      },
      {
        label: 'Mediana 1ª resposta',
        value: formatDurationPtBr(m.medianResponseHours),
        accent: VOTZ_BRAND_COLORS.primary,
      },
      {
        label: 'Taxa de resolução',
        value: formatPercentPtBr(m.resolutionRatePercent),
        accent: VOTZ_BRAND_COLORS.positive,
      },
    ]

    const cardWidth = (pageWidth - 20) / 3
    kpiCards.forEach((card, idx) => {
      const col = idx % 3
      const row = Math.floor(idx / 3)
      const cx = 48 + col * (cardWidth + 10)
      const cy = y + row * 54
      doc
        .roundedRect(cx, cy, cardWidth, 46, 6)
        .fillAndStroke(VOTZ_BRAND_COLORS.neutral, VOTZ_BRAND_COLORS.border)
      doc.rect(cx, cy + 8, 3.5, 30).fill(card.accent)
      doc
        .fillColor(VOTZ_BRAND_COLORS.muted)
        .font('Body')
        .fontSize(8)
        .text(card.label, cx + 11, cy + 7, { width: cardWidth - 20 })
      doc
        .fillColor(VOTZ_BRAND_COLORS.text)
        .font('MonoBold')
        .fontSize(13.5)
        .text(card.value, cx + 11, cy + 22, { width: cardWidth - 20 })
    })

    y += 118

    // Comparativo com período anterior
    doc
      .font('Heading')
      .fontSize(12)
      .fillColor(VOTZ_BRAND_COLORS.primary)
      .text('Comparativo com o período anterior', 48, y)
    y += 17
    doc
      .font('Body')
      .fontSize(9.5)
      .fillColor(VOTZ_BRAND_COLORS.text)
      .text(
        `Período anterior (${previousPeriodLabel}): ${formatCountPtBr(m.previousReceived)} relatos na área e ${formatCountPtBr(m.previousResolved)} resolvidos.`,
        48,
        y,
        { width: pageWidth },
      )
    y += 26

    // Categorias principais
    doc
      .font('Heading')
      .fontSize(12)
      .fillColor(VOTZ_BRAND_COLORS.primary)
      .text('Principais categorias na área', 48, y)
    y += 17
    if (snapshot.topCategories.length === 0) {
      doc
        .font('Body')
        .fontSize(9)
        .fillColor(VOTZ_BRAND_COLORS.mutedLight)
        .text('Sem categorias registradas no período selecionado.', 48, y)
      y += 20
    } else {
      for (const cat of snapshot.topCategories.slice(0, 6)) {
        doc
          .font('BodyBold')
          .fontSize(9)
          .fillColor(VOTZ_BRAND_COLORS.primary)
          .text(truncateWithEllipsis(getCategoryLabel(cat.category), 32), 48, y, {
            width: 215,
            continued: false,
          })
        doc
          .font('Mono')
          .fontSize(9)
          .fillColor(VOTZ_BRAND_COLORS.muted)
          .text(
            `Recebidos: ${formatCountPtBr(cat.receivedCount)}   ·   Resolvidos: ${formatCountPtBr(cat.resolvedCount)}`,
            268,
            y,
            { width: pageWidth - 220 },
          )
        y += 15
      }
      y += 10
    }

    if (snapshot.recurrence) {
      const rec = snapshot.recurrence
      const windowSuffix = rec.windowEnd ? ` · até ${formatDateBr(rec.windowEnd)}` : ''
      doc
        .font('Heading')
        .fontSize(12)
        .fillColor(VOTZ_BRAND_COLORS.primary)
        .text(`Reincidência por área (janela 90d${windowSuffix})`, 48, y)
      y += 17
      const recSummary =
        rec.recurrenceIndexPercent !== null
          ? `Índice de reincidência: ${formatPercentPtBr(rec.recurrenceIndexPercent)} · Células visíveis (>= 10): ${formatCountPtBr(rec.visibleCellsCount)} · Suprimidas (< 10): ${formatCountPtBr(rec.suppressedCellsCount)}`
          : `Células visíveis (>= 10): ${formatCountPtBr(rec.visibleCellsCount)} · Suprimidas por privacidade (< 10): ${formatCountPtBr(rec.suppressedCellsCount)}`
      doc.font('Body').fontSize(9).fillColor(VOTZ_BRAND_COLORS.text).text(recSummary, 48, y, {
        width: pageWidth,
      })
      y += 16
      for (const cell of rec.topCells.slice(0, 4)) {
        if (y > doc.page.height - 200) break
        const catLabel = getCategoryLabel(cell.category)
        const areaText = cell.areaLabel?.trim() || 'Área sem bairro informado'
        doc
          .font('Body')
          .fontSize(8.8)
          .fillColor(VOTZ_BRAND_COLORS.muted)
          .text(
            truncateWithEllipsis(
              `• ${catLabel} · ${areaText} (área de ~150 m): ${formatCountPtBr(cell.count90d)} ocorrências em 90 dias`,
              92,
            ),
            52,
            y,
            { width: pageWidth - 8 },
          )
        y += 14
      }
      y += 10
    }

    // Relatos resolvidos com maior apoio (somente título e data; zero dados pessoais)
    doc
      .font('Heading')
      .fontSize(12)
      .fillColor(VOTZ_BRAND_COLORS.primary)
      .text('Relatos resolvidos de maior apoio (sem dados pessoais)', 48, y)
    y += 17

    const defaultFooterY = doc.page.height - 104
    const maxListY = defaultFooterY - 22

    if (snapshot.topResolvedReports.length === 0) {
      doc
        .font('Body')
        .fontSize(9)
        .fillColor(VOTZ_BRAND_COLORS.mutedLight)
        .text('Nenhum relato resolvido registrado no recorte deste período.', 48, y)
      y += 18
    } else {
      for (const item of snapshot.topResolvedReports.slice(0, 8)) {
        if (y > maxListY) break
        const cleanTitle = truncateWithEllipsis(item.title, 66)
        doc
          .font('Body')
          .fontSize(9)
          .fillColor(VOTZ_BRAND_COLORS.text)
          .text(`• ${cleanTitle}`, 48, y, {
            width: pageWidth - 160,
            lineBreak: false,
            ellipsis: '...',
          })
        doc
          .font('Mono')
          .fontSize(8.5)
          .fillColor(VOTZ_BRAND_COLORS.muted)
          .text(
            `${formatDateBr(item.resolvedAt)} · ${formatCountPtBr(item.supportCount)} apoios`,
            doc.page.width - 200,
            y,
            {
              width: 152,
              align: 'right',
            },
          )
        y += 15
      }
    }

    // F7: em relatórios esparsos (< 3 categorias e < 3 relatos resolvidos), ancora o rodapé após o último bloco evitando o terço inferior vazio
    const isCompactFooter =
      !snapshot.recurrence &&
      snapshot.topCategories.length < 3 &&
      snapshot.topResolvedReports.length < 3
    const footerY = isCompactFooter
      ? Math.min(defaultFooterY, Math.max(460, y + 32))
      : defaultFooterY

    // Rodapé fixo de metodologia e autenticidade
    doc
      .moveTo(48, footerY)
      .lineTo(doc.page.width - 48, footerY)
      .strokeColor(VOTZ_BRAND_COLORS.border)
      .lineWidth(1)
      .stroke()

    doc
      .font('Mono')
      .fontSize(7.8)
      .fillColor(VOTZ_BRAND_COLORS.muted)
      .text(
        `Metodologia: Dicionário Votz ${snapshot.methodology.dictionaryVersion} (${formatDateBr(snapshot.methodology.dictionaryDate)}) · Fuso ${snapshot.methodology.timezone} · Calculado em ${formatDateTimeBr(snapshot.methodology.computedAt)}`,
        48,
        footerY + 8,
        { width: pageWidth },
      )
      .text(
        `Verificação pública imutável: ${snapshot.verificationUrl} · Código ${snapshot.code}`,
        48,
        footerY + 23,
        { width: pageWidth },
      )
    doc
      .font('Body')
      .fontSize(7.5)
      .fillColor(VOTZ_BRAND_COLORS.mutedLight)
      .text(snapshot.methodology.note, 48, footerY + 39, { width: pageWidth })

    doc.end()
    return endPromise
  }
}
