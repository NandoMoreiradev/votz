export const lightTheme = {
  mode: 'light' as 'light' | 'dark',
  colors: {
    primary: '#1A1A2E', badgeBg: '#1A1A2E', onAccent: '#FFFFFF',
    action: '#E63946', positive: '#187A39',
    background: '#FFFFFF', surface: '#FFFFFF', text: '#0D0D0D',
    soft: '#F4F5F7',
    muted: '#626779', border: '#E5E5EA', tint: '#FFF0F1',
    // Conversas: fundo cinza-azulado suave, balão próprio em tom claro do vermelho do Votz.
    chatBackground: '#EDEFF4', bubbleOwn: '#FFDDE0', bubblePeer: '#FFFFFF',
  },
  radius: { sm: 10, md: 14, lg: 22 },
  fonts: { heading: 'SpaceGrotesk_700Bold', body: 'Inter_400Regular', medium: 'Inter_600SemiBold' },
}

export const darkTheme: typeof lightTheme = {
  mode: 'dark',
  colors: {
    primary: '#DCE3F0', badgeBg: '#23293A', onAccent: '#FFFFFF',
    action: '#F04D5A', positive: '#4ADE80',
    background: '#0A0C10', surface: '#11141C', text: '#F3F4F6',
    soft: '#181C27',
    muted: '#8E96A8', border: '#222736', tint: '#2E1A22',
    chatBackground: '#0A0C10', bubbleOwn: '#4A1F26', bubblePeer: '#181C27',
  },
  radius: { sm: 10, md: 14, lg: 22 },
  fonts: { heading: 'SpaceGrotesk_700Bold', body: 'Inter_400Regular', medium: 'Inter_600SemiBold' },
}

export const theme = lightTheme
export type MobileTheme = typeof lightTheme
