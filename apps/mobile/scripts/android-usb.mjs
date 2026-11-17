import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk')
const sdkAdb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
const adb = existsSync(sdkAdb) ? sdkAdb : 'adb'
const run = (args) => spawnSync(adb, args, { encoding: 'utf8', windowsHide: true })
const result = run(['devices', '-l'])
if (result.error || result.status !== 0) {
  console.error('ADB não disponível. Instale Android SDK Platform-Tools e adicione ao PATH.')
  process.exit(1)
}
console.log(result.stdout.trim())
console.log(`Android SDK: ${existsSync(sdk) ? sdk : 'não localizado (opcional para builds na nuvem).'}`)
const java = spawnSync('java', ['-version'], { encoding: 'utf8', windowsHide: true })
console.log(`Java: ${java.error ? 'não localizado (opcional para builds na nuvem).' : java.stderr.split('\n')[0]}`)
const devices = result.stdout.split(/\r?\n/).filter((line) => /^\S+\s+device\b/.test(line))
if (!devices.length) {
  console.error('Conecte o Android por USB, ative a depuração USB e aceite a autorização na tela do celular.')
  process.exit(1)
}
if (process.argv.includes('--connect')) {
  if (devices.length !== 1) {
    console.error('Deixe apenas um aparelho conectado para configurar as portas sem ambiguidade.')
    process.exit(1)
  }
  const serial = devices[0].split(/\s/)[0]
  for (const port of ['3000', '8081']) {
    const reverse = run(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`])
    if (reverse.status !== 0) { console.error(reverse.stderr); process.exit(1) }
    console.log(`USB: porta ${port} encaminhada para o computador.`)
  }
}
