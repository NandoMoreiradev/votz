import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import QRCode from 'qrcode'
import Svg, { Path, Rect } from 'react-native-svg'
import { formatDeviceLinkQr } from '@votz/chat-core'
import { theme } from '../theme'

/** Código QR em SVG puro (sem módulo nativo) para aprovação entre aparelhos. */
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
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Código QR para conectar este aparelho"
      style={styles.frame}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${modules} ${modules}`}>
        <Rect width={modules} height={modules} fill="#FFFFFF" />
        <Path d={path} fill="#111111" />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
})
