import type { ConfigContext, ExpoConfig } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT
  if ((variant === 'preview' || variant === 'production') && !process.env.EXPO_PUBLIC_API_URL?.startsWith('https://')) {
    throw new Error('Configure EXPO_PUBLIC_API_URL com a URL HTTPS da API antes de gerar uma build de preview ou produção.')
  }
  return {
  ...config,
  name: 'Votz',
  slug: 'votz-mobile',
  owner: 'fernando_moreira.dev',
  extra: { eas: { projectId: 'bad8e5fc-6bbd-45ac-bbc7-5bcd2ac52ad9' } },
  scheme: 'votz',
  version: '0.1.0',
  icon: './assets/votz-icon.png',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: { supportsTablet: false, bundleIdentifier: 'br.com.votz.app' },
  android: {
    package: 'br.com.votz.app', predictiveBackGestureEnabled: true,
    adaptiveIcon: { foregroundImage: './assets/votz-foreground.png', backgroundColor: '#1A1A2E' },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-image',
    'expo-font',
    ['expo-splash-screen', { image: './assets/votz-icon.png', imageWidth: 120, backgroundColor: '#1A1A2E' }],
    ['expo-image-picker', {
      photosPermission: 'O Votz precisa acessar as fotos que você escolher para sua publicação ou relato.',
      cameraPermission: 'O Votz usa a câmera para registrar seu relato.',
      microphonePermission: false,
    }],
    ['expo-location', { locationWhenInUsePermission: 'Use sua localização para indicar onde o problema acontece.' }],
    ['expo-build-properties', { android: { usesCleartextTraffic: process.env.APP_VARIANT === 'development' } }],
  ],
  experiments: { typedRoutes: true },
  }
}
