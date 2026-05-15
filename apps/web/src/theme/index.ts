// Tokens de design do Votz — seção 5 do documento de escopo
export const theme = {
  colors: {
    primary: '#1A1A2E',    // Azul noite — seriedade, Estado, confiança
    action: '#E63946',     // Vermelho vibrante — urgência, força cidadã, Brasil
    positive: '#2DC653',   // Verde — problema resolvido, progresso
    neutral: '#F4F4F4',    // Off-white — leitura, espaço, clareza
    text: '#0D0D0D',       // Quase preto — legibilidade máxima
    white: '#FFFFFF',
    border: '#E5E5E5',
    muted: '#6B7280',
    surface: '#FFFFFF',
    surfaceHover: '#F9FAFB',
  },
  fonts: {
    heading: "'Space Grotesk', sans-serif",
    body: "'Inter', sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
  fontSizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
  fontWeights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  radii: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.08)',
    md: '0 4px 12px rgba(0,0,0,0.10)',
    lg: '0 8px 24px rgba(0,0,0,0.12)',
  },
  spacing: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },
} as const

export type Theme = typeof theme
