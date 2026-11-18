const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const config = getDefaultConfig(__dirname)
// Mobile is intentionally outside the root npm workspaces (React 19 vs React 18).
// Explicitly watch the linked, runtime-free contracts so their rebuilds invalidate Metro.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../../packages/shared-types'), path.resolve(__dirname, '../../packages/chat-core')]
// Web uses React 18 and mobile uses React 19. Keep all mobile runtime
// dependencies inside this app; the shared types package has no React runtime.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')]
module.exports = config
