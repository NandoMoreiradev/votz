import { PrismaClient, UserType, Category, ReportStatus, EntityType, EventType } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function hash(password: string) {
  return bcrypt.hash(password, 12)
}

async function main() {
  console.log('🌱 Iniciando seed...')

  // ── Admin ──────────────────────────────────────────────────────────────────

  const adminEmail = process.env.SEED_ADMIN_EMAIL
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
  if (!adminEmail || !adminPassword) {
    throw new Error('SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD são obrigatórios no .env')
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'Fernando Moreira',
      password: await hash(adminPassword),
      type: UserType.ADMIN,
      emailVerified: true,
      reputation: 100,
    },
  })
  console.log(`✅ Admin: ${admin.email}`)

  // ── Moderador ──────────────────────────────────────────────────────────────

  const mod = await prisma.user.upsert({
    where: { email: 'moderador@votz.app' },
    update: {},
    create: {
      email: 'moderador@votz.app',
      name: 'Ana Lima',
      password: await hash('Moderador@2026'),
      type: UserType.MODERATOR,
      emailVerified: true,
      reputation: 80,
    },
  })
  console.log(`✅ Moderador: ${mod.email}`)

  // ── Cidadãos ───────────────────────────────────────────────────────────────

  const [c1, c2, c3] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'joao.silva@email.com' },
      update: {},
      create: { email: 'joao.silva@email.com', name: 'João Silva', password: await hash('Cidadao@123'), type: UserType.CITIZEN, emailVerified: true, reputation: 42 },
    }),
    prisma.user.upsert({
      where: { email: 'maria.santos@email.com' },
      update: {},
      create: { email: 'maria.santos@email.com', name: 'Maria Santos', password: await hash('Cidadao@123'), type: UserType.CITIZEN, emailVerified: true, reputation: 28 },
    }),
    prisma.user.upsert({
      where: { email: 'carlos.oliveira@email.com' },
      update: {},
      create: { email: 'carlos.oliveira@email.com', name: 'Carlos Oliveira', password: await hash('Cidadao@123'), type: UserType.CITIZEN, emailVerified: true, reputation: 15 },
    }),
  ])
  console.log('✅ Cidadãos criados')

  // ── Usuários vinculados às entidades ───────────────────────────────────────

  const [uPref, uHosp] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'prefeitura@saopaulo.sp.gov.br' },
      update: {},
      create: { email: 'prefeitura@saopaulo.sp.gov.br', name: 'Prefeitura de São Paulo', password: await hash('Entidade@2026'), type: UserType.ENTITY, emailVerified: true },
    }),
    prisma.user.upsert({
      where: { email: 'hgsp@saude.sp.gov.br' },
      update: {},
      create: { email: 'hgsp@saude.sp.gov.br', name: 'Hospital das Clínicas SP', password: await hash('Entidade@2026'), type: UserType.ENTITY, emailVerified: true },
    }),
  ])

  // ── Entidades ──────────────────────────────────────────────────────────────

  const prefeitura = await prisma.entity.upsert({
    where: { cnpj: '46.395.000/0001-39' },
    update: {},
    create: {
      userId: uPref.id,
      legalName: 'Prefeitura Municipal de São Paulo',
      cnpj: '46.395.000/0001-39',
      type: EntityType.CITY_HALL,
      verified: true,
      votzScore: 62,
      city: 'São Paulo',
      state: 'SP',
      website: 'https://prefeitura.sp.gov.br',
      slaHours: { HEALTH: 48, MOBILITY: 72, SAFETY: 24, EDUCATION: 96, SANITATION: 72, HOUSING: 96, OTHER: 120 },
    },
  })

  const hospital = await prisma.entity.upsert({
    where: { cnpj: '60.979.457/0001-00' },
    update: {},
    create: {
      userId: uHosp.id,
      legalName: 'Hospital das Clínicas da FMUSP',
      cnpj: '60.979.457/0001-00',
      type: EntityType.HOSPITAL,
      verified: true,
      votzScore: 78,
      city: 'São Paulo',
      state: 'SP',
      website: 'https://hc.fm.usp.br',
    },
  })
  console.log('✅ Entidades criadas')

  // ── Usuários vinculados aos políticos ──────────────────────────────────────

  const [uVer, uDep] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'vereador.souza@camarasp.sp.gov.br' },
      update: {},
      create: { email: 'vereador.souza@camarasp.sp.gov.br', name: 'Ricardo Souza', password: await hash('Politico@2026'), type: UserType.POLITICIAN, emailVerified: true },
    }),
    prisma.user.upsert({
      where: { email: 'dep.marta@al.sp.gov.br' },
      update: {},
      create: { email: 'dep.marta@al.sp.gov.br', name: 'Marta Ferreira', password: await hash('Politico@2026'), type: UserType.POLITICIAN, emailVerified: true },
    }),
  ])

  // ── Políticos ──────────────────────────────────────────────────────────────

  const [pol1, pol2] = await Promise.all([
    prisma.politician.upsert({
      where: { userId: uVer.id },
      update: {},
      create: {
        userId: uVer.id,
        party: 'MDB',
        office: 'Vereador',
        termStart: new Date('2025-01-01'),
        termEnd: new Date('2028-12-31'),
        electoralZone: 'Zona Sul',
        state: 'SP',
        city: 'São Paulo',
        verified: true,
        mandatometer: { total: 12, resolved: 5, inProgress: 3, ignored: 4 },
      },
    }),
    prisma.politician.upsert({
      where: { userId: uDep.id },
      update: {},
      create: {
        userId: uDep.id,
        party: 'PT',
        office: 'Deputada Estadual',
        termStart: new Date('2023-02-01'),
        termEnd: new Date('2027-01-31'),
        electoralZone: 'Circunscrição SP',
        state: 'SP',
        verified: false,
        mandatometer: { total: 4, resolved: 1, inProgress: 2, ignored: 1 },
      },
    }),
  ])
  console.log('✅ Políticos criados')

  // ── Relatos ────────────────────────────────────────────────────────────────

  const reportsData = [
    {
      title: 'Buraco enorme na Av. Paulista há mais de 3 meses',
      description: 'Existe um buraco de aproximadamente 1 metro de diâmetro no cruzamento da Av. Paulista com a R. Augusta. Já causou acidentes com ciclistas e danificou pneus de vários carros. A Prefeitura foi acionada em março mas nenhuma equipe apareceu até agora.',
      category: Category.MOBILITY, status: ReportStatus.OPEN,
      city: 'São Paulo', state: 'SP', latitude: -23.5613, longitude: -46.6565,
      authorId: c1.id, recipientType: 'ENTITY' as const, recipientId: prefeitura.id,
      pressureScore: 87,
    },
    {
      title: 'UBS do Jabaquara fechada há 2 semanas sem aviso',
      description: 'A Unidade Básica de Saúde do Jabaquara está com as portas fechadas desde o dia 2 de maio sem nenhuma comunicação oficial. Idosos e crianças do bairro ficaram sem acesso a consultas agendadas e retirada de medicamentos. Liguei para a secretaria de saúde mas não consegui informações.',
      category: Category.HEALTH, status: ReportStatus.UNDER_REVIEW,
      city: 'São Paulo', state: 'SP', latitude: -23.6434, longitude: -46.6594,
      authorId: c2.id, recipientType: 'ENTITY' as const, recipientId: prefeitura.id,
      pressureScore: 124,
    },
    {
      title: 'Iluminação pública apagada na R. dos Pinheiros',
      description: 'Toda a extensão da Rua dos Pinheiros, do número 100 ao 800, está completamente sem iluminação há uma semana. À noite fica perigoso, já houve relato de assalto no trecho escuro. A situação piora nos dias de chuva.',
      category: Category.SAFETY, status: ReportStatus.IN_PROGRESS,
      city: 'São Paulo', state: 'SP', latitude: -23.5672, longitude: -46.6891,
      authorId: c3.id, recipientType: 'POLITICIAN' as const, recipientId: pol1.id,
      pressureScore: 56,
    },
    {
      title: 'Esgoto a céu aberto no córrego do Mandaqui',
      description: 'O córrego do Mandaqui, no trecho entre a R. do Cursino e a R. Vergueiro, está recebendo diretamente esgoto doméstico sem tratamento. O cheiro é insuportável e há proliferação de mosquitos. Moro a 50 metros desse trecho e minha família já adoeceu.',
      category: Category.SANITATION, status: ReportStatus.RESOLVED,
      city: 'São Paulo', state: 'SP', latitude: -23.5989, longitude: -46.6276,
      authorId: c1.id,
      pressureScore: 210,
    },
    {
      title: 'Escola municipal sem professores há 15 dias',
      description: 'A EMEF Prof. José Alves, no Ipiranga, está funcionando apenas com os alunos soltos nos pátios pois não há professores substitutos. Já são 15 dias com aulas suspensas nas turmas do 6º ao 9º ano. As famílias não foram comunicadas.',
      category: Category.EDUCATION, status: ReportStatus.OPEN,
      city: 'São Paulo', state: 'SP', latitude: -23.5889, longitude: -46.6101,
      authorId: c2.id, recipientType: 'ENTITY' as const, recipientId: prefeitura.id,
      pressureScore: 145,
    },
    {
      title: 'Falta de vagas na UTI neonatal no HC',
      description: 'Há recém-nascidos prematuros sendo transferidos para hospitais em cidades vizinhas por falta de vagas na UTI neonatal do Hospital das Clínicas. Soube de pelo menos 3 casos nesta semana. A situação é crítica e precisa de atenção urgente.',
      category: Category.HEALTH, status: ReportStatus.UNDER_REVIEW,
      city: 'São Paulo', state: 'SP', latitude: -23.5572, longitude: -46.6694,
      authorId: c3.id, recipientType: 'ENTITY' as const, recipientId: hospital.id,
      pressureScore: 193,
    },
    {
      title: 'Obras na Av. Brigadeiro inacabadas bloqueando faixa',
      description: 'Uma obra de reparo na Av. Brigadeiro Faria Lima está com uma faixa de rolamento bloqueada por tapumes desde dezembro do ano passado sem previsão de término. O canteiro está abandonado — não vejo trabalhadores há pelo menos um mês.',
      category: Category.MOBILITY, status: ReportStatus.DISPUTED,
      city: 'São Paulo', state: 'SP', latitude: -23.5712, longitude: -46.6933,
      authorId: c1.id, anonymous: true,
      pressureScore: 31,
    },
    {
      title: 'Alagamento recorrente na Vila Mariana a cada chuva',
      description: 'A R. Domingos de Morais alaga completamente a cada chuva moderada. O nível da água chega à metade das rodas dos carros. Já perdi dois celulares e um notebook em alagamentos desse. O problema existe há pelo menos 4 anos.',
      category: Category.SANITATION, status: ReportStatus.OPEN,
      city: 'São Paulo', state: 'SP', latitude: -23.5923, longitude: -46.6356,
      authorId: c2.id,
      pressureScore: 78,
    },
  ]

  const reports: any[] = []
  for (const r of reportsData) {
    const existing = await prisma.report.findFirst({ where: { title: r.title } })
    if (existing) {
      reports.push(existing)
      continue
    }
    const created = await prisma.report.create({
      data: {
        title: r.title,
        description: r.description,
        category: r.category,
        status: r.status,
        city: r.city,
        state: r.state,
        latitude: r.latitude,
        longitude: r.longitude,
        authorId: r.authorId,
        anonymous: r.anonymous ?? false,
        recipientType: r.recipientType as any,
        recipientId: r.recipientId,
        pressureScore: r.pressureScore,
      },
    })
    reports.push(created)
  }
  console.log(`✅ ${reports.length} relatos criados`)

  // ── Timeline events ────────────────────────────────────────────────────────

  for (const report of reports) {
    const existingTimeline = await prisma.timelineEvent.findFirst({ where: { reportId: report.id, type: EventType.CREATED } })
    if (existingTimeline) continue

    await prisma.timelineEvent.create({
      data: {
        reportId: report.id,
        type: EventType.CREATED,
        content: 'Relato registrado.',
        authorId: report.authorId,
      },
    })

    if (report.status === ReportStatus.UNDER_REVIEW || report.status === ReportStatus.IN_PROGRESS || report.status === ReportStatus.RESOLVED) {
      await prisma.timelineEvent.create({
        data: {
          reportId: report.id,
          type: EventType.STATUS_CHANGED,
          content: 'Relato recebido e em análise pela equipe responsável.',
          authorId: mod.id,
          metadata: { previousStatus: 'OPEN', newStatus: 'UNDER_REVIEW' },
        },
      })
    }

    if (report.status === ReportStatus.IN_PROGRESS) {
      await prisma.timelineEvent.create({
        data: {
          reportId: report.id,
          type: EventType.RESPONDED,
          content: 'Equipe técnica acionada. Previsão de resolução em 10 dias úteis.',
          authorId: uPref.id,
          metadata: { action: 'advocated' },
        },
      })
    }

    if (report.status === ReportStatus.RESOLVED) {
      await prisma.timelineEvent.create({
        data: {
          reportId: report.id,
          type: EventType.RESOLVED,
          content: 'Problema corrigido. Obra de reparo concluída e área liberada.',
          authorId: mod.id,
          metadata: { previousStatus: 'IN_PROGRESS', newStatus: 'RESOLVED' },
        },
      })
    }
  }
  console.log('✅ Timeline events criados')

  // ── Votos ──────────────────────────────────────────────────────────────────

  const voters = [
    { userId: c1.id, reportIdx: 1, type: 'SUPPORT' as const },
    { userId: c1.id, reportIdx: 2, type: 'SUPPORT' as const },
    { userId: c1.id, reportIdx: 4, type: 'ME_TOO' as const },
    { userId: c2.id, reportIdx: 0, type: 'SUPPORT' as const },
    { userId: c2.id, reportIdx: 0, type: 'ME_TOO' as const },
    { userId: c2.id, reportIdx: 5, type: 'SUPPORT' as const },
    { userId: c3.id, reportIdx: 1, type: 'ME_TOO' as const },
    { userId: c3.id, reportIdx: 4, type: 'SUPPORT' as const },
    { userId: c3.id, reportIdx: 7, type: 'ME_TOO' as const },
    { userId: admin.id, reportIdx: 3, type: 'SUPPORT' as const },
    { userId: mod.id, reportIdx: 5, type: 'SUPPORT' as const },
  ]

  for (const v of voters) {
    const report = reports[v.reportIdx]
    if (!report) continue
    await prisma.vote.upsert({
      where: { reportId_userId_type: { reportId: report.id, userId: v.userId, type: v.type } },
      update: {},
      create: { reportId: report.id, userId: v.userId, type: v.type },
    })
  }
  console.log('✅ Votos criados')

  // ── Comentários ────────────────────────────────────────────────────────────

  const commentsData = [
    { reportIdx: 0, authorId: c2.id, content: 'Passei por lá ontem e confirmo. Tem um cone de sinalização caído que está piorando o trânsito no cruzamento.' },
    { reportIdx: 0, authorId: c3.id, content: 'Meu pneu furou nesse buraco semana passada. Já protocolei ressarcimento na Prefeitura, mas sem resposta.' },
    { reportIdx: 1, authorId: c1.id, content: 'Consegui falar com a secretaria hoje. Disseram que estão "verificando a situação", sem prazo.' },
    { reportIdx: 1, authorId: admin.id, content: 'Relato encaminhado diretamente para a Secretaria Municipal de Saúde. Aguardando retorno oficial.' },
    { reportIdx: 4, authorId: c3.id, content: 'Meus filhos estudam nessa escola. É exatamente isso. As crianças ficam no pátio ou são mandadas embora mais cedo.' },
    { reportIdx: 5, authorId: c1.id, content: 'Situação gravíssima. Um vizinho meu teve o bebê transferido para Guarulhos por conta disso.' },
  ]

  for (const c of commentsData) {
    const report = reports[c.reportIdx]
    if (!report) continue
    const existing = await prisma.comment.findFirst({ where: { reportId: report.id, authorId: c.authorId, content: c.content } })
    if (existing) continue
    await prisma.comment.create({
      data: { reportId: report.id, authorId: c.authorId, content: c.content },
    })
  }
  console.log('✅ Comentários criados')

  // ── Resumo ──────────────────────────────────────────────────────────────────

  console.log('\n🎉 Seed concluído!')
  console.log('─────────────────────────────────────────')
  console.log(`👤 Admin:       ${adminEmail}`)
  console.log(`🔒 Senha admin: ${adminPassword}`)
  console.log(`👤 Moderador:   moderador@votz.app / Moderador@2026`)
  console.log(`👥 Cidadãos:    joao.silva@email.com / maria.santos@email.com / carlos.oliveira@email.com`)
  console.log(`🔑 Senha cidadãos/entidades/políticos: Cidadao@123 / Entidade@2026 / Politico@2026`)
  console.log('─────────────────────────────────────────')
}

main()
  .catch((e) => { console.error('❌ Erro no seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
