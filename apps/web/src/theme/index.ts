// Tokens de design do Votz — claro e escuro (seção 5 do documento de escopo)

const baseTokens = {
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

export const lightTheme = {
  mode: 'light' as 'light' | 'dark',
  colors: {
    primary: '#1A1A2E',    // Azul noite — seriedade, Estado, confiança
    action: '#E63946',     // Vermelho vibrante — urgência, força cidadã, Brasil
    positive: '#2DC653',   // Verde — problema resolvido, progresso
    neutral: '#F4F4F4',    // Off-white — leitura, espaço, clareza
    text: '#0D0D0D',       // Quase preto — legibilidade máxima
    white: '#FFFFFF',      // Superfície de cards/modais/inputs
    onAccent: '#FFFFFF',   // Branco puro sobre fundos coloridos (botões action/primary)
    border: '#E5E5E5',
    muted: '#6B7280',
    surface: '#FFFFFF',
    surfaceHover: '#F9FAFB',
    // Estúdio: informação (azul) e atenção (âmbar), sempre com ícone e texto junto, nunca só a cor.
    info: '#2563EB',
    warning: '#B45309',
    // Verde mais escuro para texto sobre fundo verde claro (o verde da marca não tem contraste para letra pequena).
    positiveText: '#15803D',
    borderStrong: '#D1D5DB',
    // Conversas: fundo cinza-azulado suave, balão próprio em tom claro do vermelho do Votz.
    chatBackground: '#EDEFF4',
    bubbleOwn: '#FFDDE0',
    bubblePeer: '#FFFFFF',
  },
  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.08)',
    md: '0 4px 12px rgba(0,0,0,0.10)',
    lg: '0 8px 24px rgba(0,0,0,0.12)',
  },
  ...baseTokens,
}

export const darkTheme: typeof lightTheme = {
  mode: 'dark',
  colors: {
    primary: '#4B5799',    // Azul-noite elevado: alto contraste em superfícies escuras e legível com texto branco
    action: '#F04D5A',     // Vermelho Votz com contraste calibrado para fundo escuro
    positive: '#2DC653',
    neutral: '#0F111A',    // Fundo principal azul-noite profundo
    text: '#F3F4F6',       // Texto principal de alta legibilidade
    white: '#171A26',      // Superfície de cards/modais/inputs no modo escuro
    onAccent: '#FFFFFF',   // Branco literal sobre botões coloridos
    border: '#272C40',
    muted: '#9CA3AF',
    surface: '#171A26',
    surfaceHover: '#1F2436',
    info: '#60A5FA',
    warning: '#FBBF24',
    positiveText: '#4ADE80',
    borderStrong: '#38405C',
    chatBackground: '#0C0E16',
    bubbleOwn: '#4A1F26',
    bubblePeer: '#1E2233',
  },
  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.35)',
    md: '0 4px 14px rgba(0,0,0,0.45)',
    lg: '0 8px 28px rgba(0,0,0,0.55)',
  },
  ...baseTokens,
}

export const theme = lightTheme
export type Theme = typeof lightTheme
