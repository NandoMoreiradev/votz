import { PRIVACY_VERSION } from '@votz/shared-types'
import { LEGAL_ENTITY as E, LEGAL_UPDATED_LABEL, type LegalDoc } from './types'

export const politicaDePrivacidade: LegalDoc = {
  title: 'Política de Privacidade',
  version: PRIVACY_VERSION,
  updatedLabel: LEGAL_UPDATED_LABEL,
  summary: [
    'Coletamos só o que o Votz precisa: **conta, endereço, telefone** e o que você publica (**relatos, fotos, áudios, comentários**).',
    '**Não vendemos seus dados.** Não usamos publicidade nem rastreadores de terceiros.',
    'Relato é **público**. No relato anônimo, **o Votz não guarda quem você é** junto do relato.',
    'Usamos serviços de empresas **no Brasil e no exterior** (hospedagem, e-mail, pagamento, mapa, transcrição de áudio). Listamos todos na seção 5.',
    'Você pode **ver, corrigir, baixar e apagar** seus dados no seu perfil, em Privacidade e dados.',
    'Ao apagar a conta, seus relatos **ficam sem o seu nome** (Memória pública) e o resto é apagado.',
    `Dúvidas ou pedidos: [${E.email}](mailto:${E.email}).`,
  ],
  sections: [
    {
      id: 'quem-e-responsavel',
      title: 'Quem é o responsável pelos seus dados',
      blocks: [
        { p: `O **controlador** dos dados é **${E.name}**, CNPJ ${E.cnpj}. Seguimos a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018) e o Marco Civil da Internet (Lei nº 12.965/2014).` },
        { p: `O **encarregado de dados (DPO)**, que atende você e a Autoridade Nacional de Proteção de Dados (ANPD), pode ser contatado em [${E.email}](mailto:${E.email}).` },
      ],
    },
    {
      id: 'dados-coletados',
      title: 'Quais dados coletamos',
      blocks: [
        { p: '**Dados que você nos dá:**' },
        {
          table: {
            head: ['Dado', 'Quando'],
            rows: [
              ['Nome, e-mail, senha (guardada de forma irreversível)', 'No cadastro'],
              ['Telefone', 'No cadastro'],
              ['CEP, endereço, número, bairro, cidade, estado e coordenadas do local', 'No cadastro e ao informar o local de um relato'],
              ['Foto de perfil e biografia', 'Se você preencher no perfil'],
              ['CPF (guardado criptografado)', 'Só se for pedido para algum recurso ou verificação'],
              ['Relatos: título, descrição, categoria, fotos, vídeos e localização', 'Ao registrar um relato'],
              ['Comentários em texto ou áudio (e a transcrição do áudio)', 'Ao comentar'],
              ['Apoios, votos em propostas e enquetes, mensagens e perguntas em debates, políticos que você segue', 'Ao usar o Votz'],
              ['Documentos de verificação (de entidades, políticos e empresas)', 'Ao pedir o cadastro de um perfil institucional'],
              ['Dados de contratação de plano (identificação do cliente e da assinatura na Stripe; **não guardamos o cartão**)', 'Ao contratar um plano pago'],
            ],
          },
        },
        { p: '**Dados gerados automaticamente:**' },
        {
          ul: [
            'Data do último acesso, tentativas de login e bloqueios temporários de segurança.',
            'Seu **endereço IP**, usado para limitar abusos (limite de requisições) e que também aparece nos registros técnicos da infraestrutura.',
            '**Resultados de cálculos automáticos**: pressão de um relato, agrupamento de relatos parecidos (feito com uma representação numérica do texto) e transcrição de áudios.',
          ],
        },
        { p: '**Dados de fontes públicas:** informações de políticos, partidos, entidades e municípios vêm de bases oficiais (TSE, Câmara dos Deputados, Senado Federal, IBGE). Veja a seção 12.' },
        { note: '**Quer dar dado a mais do que precisa?** Não. Se um campo não for obrigatório, pode deixar em branco.' },
      ],
    },
    {
      id: 'finalidades',
      title: 'Para que usamos seus dados',
      blocks: [
        { p: 'A LGPD exige que cada uso tenha uma justificativa legal (“base legal”). Estas são as nossas:' },
        {
          table: {
            head: ['Para quê', 'Dados', 'Base legal'],
            rows: [
              ['Criar e manter sua conta, entrar, recuperar acesso', 'Cadastro, e-mail, senha', 'Execução do contrato (Termos de Uso)'],
              ['Publicar seu relato, apoios e comentários, e mostrar no mapa', 'Conteúdo e localização', 'Execução do contrato'],
              ['Manter a Memória pública dos relatos', 'Conteúdo dos relatos (sem o seu nome após o encerramento da conta)', 'Legítimo interesse e exercício regular de direitos; interesse público na transparência'],
              ['Enviar e-mails do serviço (confirmar e-mail, convites, avisos, exportação de dados)', 'Nome, e-mail', 'Execução do contrato'],
              ['Segurança, prevenção de fraude, bloqueio de abuso e robôs', 'IP, tentativas de login, dados de conta', 'Legítimo interesse'],
              ['Verificar perfis de entidades, políticos e empresas', 'Documentos e dados do representante', 'Execução do contrato e legítimo interesse'],
              ['Cobrar planos pagos e cumprir obrigações fiscais', 'Dados de contratação', 'Execução do contrato e obrigação legal'],
              ['Calcular pressão, achar relatos parecidos e detectar surtos', 'Texto e local dos relatos', 'Legítimo interesse'],
              ['Transcrever áudios de comentários', 'Áudio', 'Execução do contrato'],
              ['Atender ordens judiciais e autoridades', 'Os dados exigidos pela lei', 'Obrigação legal'],
              ['Guardar registros de acesso exigidos por lei', 'Data, hora e IP de acesso', 'Obrigação legal (Marco Civil, art. 15)'],
            ],
          },
        },
        { p: 'Se algum dia usarmos seus dados para outra finalidade, avisamos e, quando for o caso, pedimos o seu consentimento. Você pode retirar um consentimento quando quiser.' },
      ],
    },
    {
      id: 'publico-e-anonimo',
      title: 'O que é público e o relato anônimo',
      blocks: [
        { p: '**Público para qualquer pessoa:** o título, a descrição, as fotos e os vídeos do relato, a categoria, o local (que aparece no mapa), a situação, a linha do tempo, os apoios e os comentários. Seu **nome de autor também aparece**, a não ser que o relato seja anônimo.' },
        { p: '**Relato anônimo:** seu nome e seu perfil não são mostrados a ninguém, e o Votz **não guarda a ligação** entre você e o relato. Porém:' },
        {
          ul: [
            'Por isso, você não recebe avisos nem pode contestar nesse relato.',
            '**Anonimato total na internet não existe.** Registros técnicos de acesso (endereço IP e horário) e o conteúdo do relato podem, numa investigação judicial, ajudar a identificar o autor. Podemos ser obrigados a entregar esses registros a uma autoridade.',
            'O que você escreve ou fotografa pode revelar quem você é. **Cuide do conteúdo.**',
          ],
        },
        { note: '**Fotos e vídeos** podem mostrar rostos, placas e documentos de outras pessoas. Antes de publicar, cubra ou corte o que identifique alguém sem necessidade.' },
      ],
    },
    {
      id: 'compartilhamento',
      title: 'Com quem compartilhamos',
      blocks: [
        { p: 'Não vendemos seus dados. Compartilhamos só com empresas que nos prestam serviço (“operadores”), sob contrato, apenas no que é necessário:' },
        {
          table: {
            head: ['Quem', 'Para quê', 'Onde'],
            rows: [
              ['Render', 'Hospedagem do site e da API (servidor em Frankfurt)', 'Europa / EUA'],
              ['Neon', 'Banco de dados', 'Exterior'],
              ['Redis (infraestrutura de filas)', 'Tarefas em segundo plano', 'Exterior'],
              ['Cloudflare R2', 'Guarda de fotos, vídeos, áudios, documentos e arquivos de exportação', 'Exterior'],
              ['Google', 'Login com Google; análise de texto (representação numérica) para achar relatos parecidos', 'EUA e outros países'],
              ['Groq', 'Transcrição automática de áudios', 'EUA'],
              ['Stripe', 'Pagamento de planos', 'EUA / Europa'],
              ['MapTiler', 'Mapas (seu navegador pede o mapa direto a eles)', 'Europa'],
              ['LiveKit', 'Debates ao vivo (áudio e vídeo)', 'Exterior'],
              ['BrasilAPI', 'Busca de endereço pelo CEP', 'Brasil'],
              ['Provedor de e-mail (SMTP)', 'Envio dos e-mails do serviço', 'A definir em produção'],
            ],
          },
        },
        { p: 'Também podemos compartilhar dados com **autoridades**, quando a lei ou uma ordem judicial exigir, e com **entidades, políticos e empresas** apenas o que já é público no relato dirigido a elas.' },
        { p: 'A **API pública** do Votz entrega dados públicos de relatos e perfis. Ela não entrega a identidade de quem fez relato anônimo.' },
      ],
    },
    {
      id: 'transferencia-internacional',
      title: 'Transferência para fora do Brasil',
      blocks: [
        { p: 'Alguns dos serviços acima funcionam fora do Brasil. Por isso, seus dados podem ser tratados em outros países. Só usamos fornecedores que oferecem proteção adequada e garantias contratuais, como exige o art. 33 da LGPD. Você pode pedir mais informações pelo e-mail do encarregado.' },
      ],
    },
    {
      id: 'retencao',
      title: 'Por quanto tempo guardamos',
      blocks: [
        {
          table: {
            head: ['Dado', 'Quanto tempo'],
            rows: [
              ['Dados da conta', 'Enquanto a conta existir. Apagados quando você encerra a conta.'],
              ['Conta sem uso', 'Podemos anonimizar contas sem acesso por mais de 24 meses, avisando por e-mail antes.'],
              ['Relatos e linha do tempo (Memória pública)', 'Sem prazo definido. Quando a conta é encerrada, o relato fica sem o seu nome.'],
              ['Comentários, apoios e áudios', 'Enquanto a conta existir. Apagados junto com ela.'],
              ['Documentos de verificação', 'Só o tempo necessário para verificar e auditar o perfil: até 12 meses após a decisão, ou 30 dias se o pedido for recusado.'],
              ['Arquivos de exportação dos seus dados', 'O link vale 24 horas. O arquivo é apagado em até 7 dias.'],
              ['Registros de acesso (data, hora, IP)', '6 meses, como manda o Marco Civil.'],
              ['Dados de cobrança e fiscais', '5 anos, como manda a lei.'],
              ['Cópias de segurança (backup)', 'Até 30 dias.'],
            ],
          },
        },
        { p: 'Podemos guardar dados por mais tempo quando a lei exigir ou para nos defender em processo judicial ou administrativo.' },
      ],
    },
    {
      id: 'seus-direitos',
      title: 'Seus direitos',
      blocks: [
        { p: 'A LGPD (art. 18) garante a você, a qualquer momento:' },
        {
          ul: [
            'saber se tratamos seus dados e **ter acesso** a eles;',
            '**corrigir** dados incompletos ou errados;',
            '**anonimizar, bloquear ou eliminar** dados desnecessários ou tratados de forma irregular;',
            'pedir a **portabilidade** dos seus dados;',
            'saber com quem compartilhamos seus dados;',
            '**retirar o consentimento**, quando o uso depender dele;',
            '**se opor** a um uso que considere indevido;',
            'pedir a **revisão de decisões automáticas** que afetem você.',
          ],
        },
        { p: '**Como exercer:**' },
        {
          ul: [
            '**No seu perfil:** em Meu perfil → Privacidade e dados, você pode **baixar uma cópia dos seus dados** (enviamos o link por e-mail) e **encerrar sua conta**.',
            `**Por e-mail:** para qualquer outro pedido, escreva para [${E.email}](mailto:${E.email}). Respondemos em até **15 dias**.`,
          ],
        },
        { p: '**O que acontece quando você encerra a conta:**' },
        {
          ul: [
            '**Apagamos:** dados de cadastro, comentários (inclusive áudios), apoios, notificações, mensagens e votos em debates, votos em propostas, chaves de API, seguidores e documentos de verificação.',
            '**Mantemos sem o seu nome:** os relatos e os eventos da linha do tempo, porque fazem parte da Memória pública e podem ser usados por outras pessoas e instituições. Eles passam a constar como anônimos. Se achar que um relato seu precisa sair por outro motivo, escreva ao encarregado.',
            '**Guardamos pelo prazo da lei:** o que for exigido (registros de acesso, dados fiscais).',
          ],
        },
        { p: 'Se não ficar satisfeito com a nossa resposta, você pode reclamar à **ANPD** (gov.br/anpd).' },
      ],
    },
    {
      id: 'automaticas',
      title: 'Decisões automáticas',
      blocks: [
        { p: 'Alguns números do Votz são calculados por regras automáticas, sem análise de uma pessoa a cada caso:' },
        {
          ul: [
            '**Pressão** de um relato: sobe com apoios, comentários, dias sem resposta e relatos parecidos.',
            '**Votz Score** e **Mandatômetro**: indicadores de desempenho de entidades e políticos no Votz.',
            '**Surtos** e **relatos parecidos**: agrupamentos feitos pelo sistema.',
          ],
        },
        { p: `Esses indicadores não definem direitos seus. Se achar que algum está errado, peça a revisão por [${E.email}](mailto:${E.email}).` },
      ],
    },
    {
      id: 'seguranca',
      title: 'Como protegemos seus dados',
      blocks: [
        {
          ul: [
            'Senhas guardadas com criptografia irreversível. O CPF é guardado **criptografado**.',
            'Conexão protegida (HTTPS) e sessão com credenciais de curta duração.',
            '**Verificação em duas etapas (MFA)** obrigatória para perfis de entidades, políticos, empresas e administração.',
            'Limites de tentativas e de requisições contra ataques e robôs.',
            'Acesso interno restrito ao que cada pessoa precisa.',
          ],
        },
        { p: 'Nenhum sistema é 100% seguro. Se houver um incidente que possa trazer risco ou dano relevante a você, **avisaremos você e a ANPD** no prazo previsto em lei.' },
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies',
      blocks: [
        { p: 'Usamos um único cookie, necessário para manter você conectado. Não usamos cookies de publicidade nem de análise. Detalhes na [Política de Cookies](/cookies).' },
      ],
    },
    {
      id: 'menores',
      title: 'Menores de idade',
      blocks: [
        { p: 'O Votz é só para **maiores de 18 anos**. Não coletamos dados de menores de propósito. Se soubermos de uma conta de menor, vamos encerrá-la e apagar os dados. Se você perceber que um menor usa o Votz, avise pelo e-mail do encarregado.' },
      ],
    },
    {
      id: 'dados-publicos',
      title: 'Dados de políticos, entidades e empresas',
      blocks: [
        { p: 'Mostramos dados de políticos e partidos vindos de bases oficiais públicas (como TSE, Câmara dos Deputados, Senado Federal), e de entidades e municípios (como IBGE). Tratamos esses dados para a finalidade pública para a qual foram divulgados: **transparência e controle social**.' },
        { p: `Se você é uma dessas pessoas ou organizações e encontrou um erro, ou quer reivindicar o perfil, escreva para [${E.email}](mailto:${E.email}).` },
      ],
    },
    {
      id: 'mudancas',
      title: 'Mudanças nesta Política',
      blocks: [
        { p: 'Podemos atualizar esta Política. Cada versão tem número e data. Em mudança importante, avisamos e pedimos que você aceite de novo antes de continuar.' },
      ],
    },
    {
      id: 'contato',
      title: 'Contato',
      blocks: [
        { p: `**${E.name}** · CNPJ ${E.cnpj}` },
        { p: `Encarregado de dados e suporte: [${E.email}](mailto:${E.email}).` },
      ],
    },
  ],
}
