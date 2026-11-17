const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const config = getDefaultConfig(__dirname)
// Web uses React 18 and mobile uses React 19. Keep all mobile runtime
// dependencies inside this app; the shared types package has no React runtime.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')]
module.exports = config
