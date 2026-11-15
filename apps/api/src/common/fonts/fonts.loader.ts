import * as fs from 'fs'
import * as path from 'path'

export interface BundledFonts {
  spaceGroteskBold: Buffer
  interRegular: Buffer
  interSemiBold: Buffer
  jetBrainsMonoRegular: Buffer
  jetBrainsMonoBold: Buffer
}

let cachedFonts: BundledFonts | null = null

function resolveFontsDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../../assets/fonts'),
    path.resolve(__dirname, '../../../../assets/fonts'),
    path.resolve(process.cwd(), 'apps/api/assets/fonts'),
    path.resolve(process.cwd(), 'assets/fonts'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'SpaceGrotesk-Bold.ttf'))) {
      return candidate
    }
  }
  throw new Error('Bundled OFL fonts directory not found in apps/api/assets/fonts')
}

export function loadBundledFonts(): BundledFonts {
  if (cachedFonts) return cachedFonts
  const dir = resolveFontsDir()
  cachedFonts = {
    spaceGroteskBold: fs.readFileSync(path.join(dir, 'SpaceGrotesk-Bold.ttf')),
    interRegular: fs.readFileSync(path.join(dir, 'Inter-Regular.ttf')),
    interSemiBold: fs.readFileSync(path.join(dir, 'Inter-SemiBold.ttf')),
    jetBrainsMonoRegular: fs.readFileSync(path.join(dir, 'JetBrainsMono-Regular.ttf')),
    jetBrainsMonoBold: fs.readFileSync(path.join(dir, 'JetBrainsMono-Bold.ttf')),
  }
  return cachedFonts
}
