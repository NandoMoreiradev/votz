import { Injectable } from '@nestjs/common'
import { ShareCardFormat } from '@prisma/client'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
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

function formatDateBr(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : isoDate
}

function formatHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return '—'
  if (hours < 24) return `${hours.toFixed(0)}h`
  return `${(hours / 24).toFixed(1)}d`
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

    const metricBox = (label: string, value: string, accent: string) => ({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#FFFFFF',
          border: '2px solid #E2E8F0',
          borderRadius: 24,
          padding: isStories ? '34px 38px' : '28px 34px',
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                fontSize: isStories ? 26 : 23,
                fontWeight: 600,
                color: '#475569',
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
                color: accent,
                fontFamily: 'JetBrains Mono',
                marginTop: 10,
              },
              children: value,
            },
          },
        ],
      },
    })

    const receivedText = input.suppressed ? '< 5' : String(input.received)
    const resolvedText = input.suppressed ? '< 5' : String(input.resolved)
    const medianText = input.suppressed ? '—' : formatHours(input.medianResponseHours)

    const root = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: '#F8FAFC',
          padding: `${padY}px ${padX}px`,
          fontFamily: 'Inter',
          color: '#0F172A',
        },
        children: [
          // Header
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            backgroundColor: '#0F172A',
                            color: '#FFFFFF',
                            fontFamily: 'Space Grotesk',
                            fontWeight: 700,
                            fontSize: 28,
                            padding: '10px 24px',
                            borderRadius: 12,
                          },
                          children: 'VOTZ · TRANSPARÊNCIA',
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: 22,
                            fontWeight: 600,
                            color: '#475569',
                            fontFamily: 'JetBrains Mono',
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
                      marginTop: isStories ? 56 : 36,
                      fontSize: isStories ? 64 : 54,
                      fontWeight: 700,
                      fontFamily: 'Space Grotesk',
                      lineHeight: 1.12,
                      color: '#0F172A',
                    },
                    children: input.politicianName,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      marginTop: 14,
                      fontSize: isStories ? 32 : 28,
                      fontWeight: 600,
                      color: '#1D4ED8',
                      fontFamily: 'Inter',
                    },
                    children: `${input.roleLabel} · ${input.territoryLabel}`,
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
                marginTop: isStories ? 48 : 28,
                marginBottom: isStories ? 48 : 28,
              },
              children: [
                metricBox(
                  'Relatos recebidos no território',
                  receivedText,
                  '#0F172A',
                ),
                metricBox(
                  'Relatos resolvidos no período',
                  resolvedText,
                  '#047857',
                ),
                metricBox(
                  'Tempo mediano de resposta',
                  medianText,
                  '#1D4ED8',
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
                borderTop: '2px solid #CBD5E1',
                paddingTop: 28,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: isStories ? 26 : 22,
                      fontWeight: 700,
                      color: '#0F172A',
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
                      fontSize: isStories ? 22 : 19,
                      color: '#475569',
                      fontFamily: 'JetBrains Mono',
                    },
                    children: input.publicUrl,
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
