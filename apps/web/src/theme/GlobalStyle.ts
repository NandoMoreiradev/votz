import { createGlobalStyle } from 'styled-components'

export const GlobalStyle = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    font-size: 16px;
    -webkit-text-size-adjust: 100%;
    color-scheme: ${({ theme }) => theme.mode};
  }

  body {
    font-family: ${({ theme }) => theme.fonts.body};
    font-size: ${({ theme }) => theme.fontSizes.md};
    color: ${({ theme }) => theme.colors.text};
    background-color: ${({ theme }) => theme.colors.neutral};
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: ${({ theme }) => theme.fonts.heading};
    font-weight: ${({ theme }) => theme.fontWeights.bold};
    line-height: 1.2;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  button {
    cursor: pointer;
    font-family: inherit;
  }

  img, svg {
    display: block;
    max-width: 100%;
  }

  #root {
    min-height: 100vh;
  }
`
