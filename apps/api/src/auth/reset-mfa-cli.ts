import { PrismaClient } from '@prisma/client'

/**
 * Zera a verificação em duas etapas (MFA) de UMA conta, para a pessoa configurar de novo
 * com o próprio celular. Uso de suporte: o dono confirma quem é a pessoa antes de rodar.
 *
 *   npm run auth:reset-mfa --workspace=apps/api -- --email=pessoa@exemplo.com
 *
 * O que faz: desliga o MFA, apaga o segredo e os códigos de backup, tira o bloqueio por
 * tentativas e encerra as sessões abertas. No próximo login, admin e moderador caem na tela
 * "Segurança obrigatória" com o QR code; as outras contas ativam em Meu perfil.
 */
function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const direct = process.argv.find((arg) => arg.startsWith(prefix))
  if (direct) return direct.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index !== -1 ? process.argv[index + 1] : undefined
}

async function main() {
  const email = parseArg('email')?.trim().toLowerCase()
  if (!email) {
    console.error('Diga qual conta: --email=pessoa@exemplo.com')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, type: true, mfaEnabled: true, mfaSecret: true },
    })
    if (!user) {
      console.error(`Nenhuma conta com o e-mail ${email}.`)
      process.exit(1)
    }

    const now = new Date()
    const [, sessions] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaFailedAttempts: 0, mfaLockedUntil: null },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      }),
    ])

    console.log(`Conta ${email} (${user.type})`)
    console.log(`MFA antes: ${user.mfaEnabled ? 'ativo' : 'inativo'}${user.mfaSecret ? ', com segredo guardado' : ''}`)
    console.log('MFA agora: zerado. Sessões encerradas: ' + sessions.count)
    console.log('Próximo passo: entrar de novo e escanear o QR code com o app autenticador do celular.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
