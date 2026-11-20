import { useMemo } from 'react'
import QRCode from 'qrcode'
import styled from 'styled-components'
import { formatDeviceLinkQr } from '@votz/chat-core'

const Frame = styled.div`
  display: inline-flex;
  padding: 12px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid ${({ theme }) => theme.colors.border};
  align-self: center;
`

/**
 * Código QR puro em SVG (sem rede nem dependência nativa) para o celular ler
 * na tela "Aparelhos conectados" e aprovar o acesso deste navegador.
 */
export function DeviceLinkQr({
  id,
  code,
  size = 180,
}: {
  id?: string
  code: string
  size?: number
}) {
  const { modules, path } = useMemo(() => {
    const qr = QRCode.create(formatDeviceLinkQr({ id, code }), {
      errorCorrectionLevel: 'M',
    })
    const count = qr.modules.size
    const parts: string[] = []
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) {
        if (qr.modules.get(x, y)) parts.push(`M${x},${y}h1v1h-1z`)
      }
    }
    return { modules: count, path: parts.join('') }
  }, [id, code])

  return (
    <Frame>
      <svg
        role="img"
        aria-label="Código QR para conectar este aparelho"
        width={size}
        height={size}
        viewBox={`0 0 ${modules} ${modules}`}
        shapeRendering="crispEdges"
      >
        <rect width={modules} height={modules} fill="#ffffff" />
        <path d={path} fill="#111111" />
      </svg>
    </Frame>
  )
}
