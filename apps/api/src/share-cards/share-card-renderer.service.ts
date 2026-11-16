import { Injectable } from '@nestjs/common'
import { ShareCardFormat } from '@prisma/client'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import {
  formatCountPtBr,
  formatDateBr,
  formatDurationPtBr,
  truncateWithEllipsis,
  VOTZ_BRAND_COLORS,
} from '../common/branding/votz-visual'
import { loadBundledFonts } from '../common/fonts/fonts.loader'

export interface ShareCardRenderInput {
  format: ShareCardFormat
  politicianName: string
  roleLabel: string
  territoryLabel: string
  periodStart: string
  periodEnd: string
  received: number
  resolved: number
  medianResponseHours: number | null
  suppressed: boolean
  publicUrl: string
}

@Injectable()
export class ShareCardRendererService {
  async renderPng(input: ShareCardRenderInput): Promise<Buffer> {
    const fonts = loadBundledFonts()
    const isStories = input.format === ShareCardFormat.STORIES
    const width = 1080
    const height = isStories ? 1920 : 1350

    const padX = 76
    const padY = isStories ? 120 : 76
    const innerWidth = width - padX * 2
    const innerHeight = height - padY * 2

    const metricBox = (label: string, value: string, accent: string, valueColor: string) => ({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: VOTZ_BRAND_COLORS.white,
          border: `2px solid ${VOTZ_BRAND_COLORS.border}`,
          borderLeft: `10px solid ${accent}`,
          borderRadius: 20,
          padding: isStories ? '34px 36px' : '26px 32px',
          width: `${innerWidth}px`,
          boxSizing: 'border-box',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                fontSize: isStories ? 26 : 23,
                fontWeight: 600,
                color: VOTZ_BRAND_COLORS.muted,
                fontFamily: 'Inter',
              },
              children: label,
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: isStories ? 76 : 64,
                fontWeight: 700,
                color: valueColor,
                fontFamily: 'JetBrains Mono',
                marginTop: 10,
              },
              children: value,
            },
          },
        ],
      },
    })

    const receivedText = input.suppressed ? '< 5' : formatCountPtBr(input.received)
    const resolvedText = input.suppressed ? '< 5' : formatCountPtBr(input.resolved)
    const medianText = input.suppressed ? '—' : formatDurationPtBr(input.medianResponseHours)
    const safePoliticianName = truncateWithEllipsis(input.politicianName, isStories ? 56 : 48)
    const safeRoleTerritory = truncateWithEllipsis(
      `${input.roleLabel} · ${input.territoryLabel}`,
      64,
    )
    const safePublicUrl = truncateWithEllipsis(input.publicUrl, 72)

    const root = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: VOTZ_BRAND_COLORS.neutral,
          fontFamily: 'Inter',
          color: VOTZ_BRAND_COLORS.text,
          overflow: 'hidden',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                width: `${innerWidth}px`,
                height: `${innerHeight}px`,
                boxSizing: 'border-box',
              },
              children: [
                // Header
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      width: `${innerWidth}px`,
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: `${innerWidth}px`,
                            gap: 16,
                          },
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 12,
                                  backgroundColor: VOTZ_BRAND_COLORS.primary,
                                  color: VOTZ_BRAND_COLORS.white,
                                  fontFamily: 'Space Grotesk',
                                  fontWeight: 700,
                                  fontSize: 25,
                                  padding: '10px 22px',
                                  borderRadius: 12,
                                  flexShrink: 0,
                                },
                                children: [
                                  {
                                    type: 'div',
                                    props: {
                                      style: {
                                        width: 10,
                                        height: 10,
                                        borderRadius: 999,
                                        backgroundColor: VOTZ_BRAND_COLORS.action,
                                      },
                                    },
                                  },
                                  'VOTZ · TRANSPARÊNCIA',
                                ],
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: {
                                  fontSize: 21,
                                  fontWeight: 600,
                                  color: VOTZ_BRAND_COLORS.muted,
                                  fontFamily: 'JetBrains Mono',
                                  flexShrink: 0,
                                },
                                children: `${formatDateBr(input.periodStart)} – ${formatDateBr(input.periodEnd)}`,
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            marginTop: isStories ? 52 : 34,
                            fontSize: isStories ? 60 : 50,
                            fontWeight: 700,
                            fontFamily: 'Space Grotesk',
                            lineHeight: 1.12,
                            color: VOTZ_BRAND_COLORS.primary,
                            maxWidth: `${innerWidth}px`,
                            wordBreak: 'break-word',
                          },
                          children: safePoliticianName,
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            marginTop: 14,
                            fontSize: isStories ? 30 : 26,
                            fontWeight: 600,
                            color: VOTZ_BRAND_COLORS.action,
                            fontFamily: 'Inter',
                            maxWidth: `${innerWidth}px`,
                            wordBreak: 'break-word',
                          },
                          children: safeRoleTerritory,
                        },
                      },
                    ],
                  },
                },
                // 3 factual metrics
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: isStories ? 28 : 20,
                      marginTop: isStories ? 44 : 24,
                      marginBottom: isStories ? 44 : 24,
                      width: `${innerWidth}px`,
                    },
                    children: [
                      metricBox(
                        'Relatos recebidos no território',
                        receivedText,
                        VOTZ_BRAND_COLORS.primary,
                        VOTZ_BRAND_COLORS.primary,
                      ),
                      metricBox(
                        'Relatos resolvidos no período',
                        resolvedText,
                        VOTZ_BRAND_COLORS.positive,
                        VOTZ_BRAND_COLORS.positive,
                      ),
                      metricBox(
                        'Tempo mediano de resposta',
                        medianText,
                        VOTZ_BRAND_COLORS.primary,
                        VOTZ_BRAND_COLORS.text,
                      ),
                    ],
                  },
                },
                // Footer
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      borderTop: `2px solid ${VOTZ_BRAND_COLORS.border}`,
                      paddingTop: 26,
                      width: `${innerWidth}px`,
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: isStories ? 26 : 22,
                            fontWeight: 700,
                            color: VOTZ_BRAND_COLORS.primary,
                            fontFamily: 'Space Grotesk',
                          },
                          children: 'Dados públicos verificáveis · Votz',
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            marginTop: 8,
                            fontSize: isStories ? 21 : 18,
                            color: VOTZ_BRAND_COLORS.muted,
                            fontFamily: 'JetBrains Mono',
                            maxWidth: `${innerWidth}px`,
                            wordBreak: 'break-word',
                          },
                          children: safePublicUrl,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    }

    const svg = await satori(root as any, {
      width,
      height,
      fonts: [
        {
          name: 'Space Grotesk',
          data: fonts.spaceGroteskBold,
          weight: 700,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: fonts.interRegular,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: fonts.interSemiBold,
          weight: 600,
          style: 'normal',
        },
        {
          name: 'JetBrains Mono',
          data: fonts.jetBrainsMonoRegular,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'JetBrains Mono',
          data: fonts.jetBrainsMonoBold,
          weight: 700,
          style: 'normal',
        },
      ],
    })

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: width },
    })
    return Buffer.from(resvg.render().asPng())
  }
}
