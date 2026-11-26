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
    primary: '#1A1A2E',                   // Azul noite — seriedade, Estado, confiança
    primaryHover: '#262642',
    primaryText: '#1A1A2E',               // Texto/contorno da cor primária com contraste garantido
    action: '#E63946',                    // Vermelho vibrante — urgência, força cidadã, Brasil
    actionHover: '#CC2F3B',
    positive: '#2DC653',                  // Verde — problema resolvido, progresso
    neutral: '#F6F7F9',                   // Fundo neutro limpo — leitura, espaço, clareza
    text: '#0F1419',                      // Quase preto — legibilidade máxima
    white: '#FFFFFF',                     // Superfície de cards/modais/inputs
    onAccent: '#FFFFFF',                  // Branco puro sobre fundos coloridos (botões action/primary)
    border: '#E5E8EE',
    muted: '#5B6472',
    surface: '#FFFFFF',
    surfaceHover: '#F1F3F6',
    chromeBg: 'rgba(255, 255, 255, 0.88)', // Navbar translúcida no tema claro
    chromeSolid: '#FFFFFF',
    chromeBorder: '#E5E8EE',
    footerBg: '#11141C',                  // Rodapé institucional sóbrio
    // Estúdio: informação (azul) e atenção (âmbar), sempre com ícone e texto junto, nunca só a cor.
    info: '#2563EB',
    warning: '#B45309',
    // Verde mais escuro para texto sobre fundo verde claro (o verde da marca não tem contraste para letra pequena).
    positiveText: '#15803D',
    borderStrong: '#CFD5E0',
    // Conversas: fundo cinza-azulado suave, balão próprio em tom claro do vermelho do Votz.
    chatBackground: '#EDEFF4',
    bubbleOwn: '#FFDDE0',
    bubblePeer: '#FFFFFF',
  },
  shadows: {
    sm: '0 1px 3px rgba(15, 20, 25, 0.06)',
    md: '0 4px 14px rgba(15, 20, 25, 0.09)',
    lg: '0 10px 28px rgba(15, 20, 25, 0.12)',
  },
  ...baseTokens,
}

export const darkTheme: typeof lightTheme = {
  mode: 'dark',
  colors: {
    primary: '#23293A',                   // Grafite azulado sóbrio (substitui o roxo lavado)
    primaryHover: '#2E364D',
    primaryText: '#DCE3F0',               // Texto/contorno claro de alto contraste sobre superfícies escuras
    action: '#F04D5A',                    // Vermelho Votz calibrado para fundo escuro
    actionHover: '#DC3B48',
    positive: '#2DC653',
    neutral: '#0A0C10',                   // Obsidiana profunda — limpo e confortável
    text: '#F3F4F6',                      // Texto principal de alta legibilidade
    white: '#11141C',                     // Superfície elevada de cards/modais/inputs no modo escuro
    onAccent: '#FFFFFF',                  // Branco literal sobre botões coloridos
    border: '#222736',
    muted: '#8E96A8',
    surface: '#11141C',
    surfaceHover: '#191E2A',
    chromeBg: 'rgba(13, 16, 23, 0.88)',   // Navbar obsidiana translúcida
    chromeSolid: '#0D1017',
    chromeBorder: '#222736',
    footerBg: '#0D1017',
    info: '#60A5FA',
    warning: '#FBBF24',
    positiveText: '#4ADE80',
    borderStrong: '#323A4F',
    chatBackground: '#0A0C10',
    bubbleOwn: '#4A1F26',
    bubblePeer: '#181C27',
  },
  shadows: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.40)',
    md: '0 4px 16px rgba(0, 0, 0, 0.50)',
    lg: '0 12px 32px rgba(0, 0, 0, 0.60)',
  },
  ...baseTokens,
}

export const theme = lightTheme
export type Theme = typeof lightTheme
