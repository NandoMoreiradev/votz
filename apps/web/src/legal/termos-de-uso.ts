import { TERMS_VERSION } from '@votz/shared-types'
import { LEGAL_ENTITY as E, LEGAL_UPDATED_LABEL, type LegalDoc } from './types'

export const termosDeUso: LegalDoc = {
  title: 'Termos de Uso',
  version: TERMS_VERSION,
  updatedLabel: LEGAL_UPDATED_LABEL,
  summary: [
    'O Votz é uma plataforma pública onde você **registra problemas**, junta apoios e **cobra resposta** de quem deve agir.',
    'Você precisa ter **18 anos ou mais** e dizer a verdade. Você é responsável pelo que publica.',
    'Seu relato fica **público**. Depois de publicado, você **não consegue apagá-lo**. Ele vira parte da Memória pública.',
    'No relato anônimo, o Votz **não guarda quem você é** junto do relato. Por isso, **você não recebe avisos nem pode contestar** nesse relato.',
    'Cobramos fatos, não pessoas. Ofensa, ameaça e mentira não ficam. Leia as [Diretrizes da Comunidade](/diretrizes).',
    'O Votz **não promete resolver** o seu problema. Promete **registrar, dar visibilidade e criar pressão**.',
    'O Votz **não é órgão do governo**. Em emergência, ligue 190, 192 ou 193.',
  ],
  sections: [
    {
      id: 'quem-somos',
      title: 'Quem somos e como aceitar estes Termos',
      blocks: [
        {
          p: `O Votz é operado por **${E.name}**, CNPJ ${E.cnpj} (“Votz”, “nós”). Estes Termos valem para qualquer pessoa que use o site, o aplicativo ou a API do Votz (“você”).`,
        },
        {
          p: 'Ao criar a conta e marcar a caixa de aceite, você declara que leu e concorda com estes Termos e com a [Política de Privacidade](/privacidade). Guardamos a data e a versão que você aceitou. Se não concordar, não use o Votz.',
        },
        {
          p: 'Fazem parte destes Termos: a [Política de Privacidade](/privacidade), a [Política de Cookies](/cookies) e as [Diretrizes da Comunidade](/diretrizes).',
        },
      ],
    },
    {
      id: 'o-que-e',
      title: 'O que é o Votz (e o que não é)',
      blocks: [
        {
          p: 'O Votz transforma reclamação em registro, registro em pressão e pressão em ação. Usamos estas palavras:',
        },
        {
          table: {
            head: ['Termo', 'O que significa'],
            rows: [
              ['**Relato**', 'A postagem de um problema.'],
              ['**Apoio**', 'Quando alguém apoia um relato. Não é curtida: é apoio.'],
              ['**Pressão**', 'O nível coletivo de urgência de um relato, calculado automaticamente.'],
              ['**Memória**', 'O histórico público e permanente dos fatos de um relato.'],
              ['**Avocar**', 'Quando um político assume um problema.'],
              ['**Contestar**', 'Quando quem fez o relato discorda de um “resolvido”.'],
              ['**Surto**', 'Alerta de vários relatos parecidos na mesma região.'],
              ['**Votz Score e Mandatômetro**', 'Indicadores sobre o desempenho de entidades e políticos no Votz.'],
            ],
          },
        },
        { p: 'O Votz **não é** órgão público, não representa nenhum governo, partido ou candidato, e não presta serviço jurídico. Não substituímos os canais oficiais de atendimento nem os serviços de emergência.' },
        { note: '**Emergência?** Não use o Votz. Ligue 190 (Polícia), 192 (SAMU) ou 193 (Bombeiros).' },
      ],
    },
    {
      id: 'quem-pode-usar',
      title: 'Quem pode usar',
      blocks: [
        {
          ul: [
            'Você precisa ter **18 anos ou mais**. Se descobrirmos uma conta de menor de idade, ela será encerrada.',
            'Use dados verdadeiros e mantenha o cadastro atualizado.',
            'Uma pessoa, uma conta. Não crie várias contas para inflar apoios ou fugir de uma suspensão.',
            'Cuide da sua senha e do seu código de segurança (MFA). O que for feito com a sua conta é de sua responsabilidade. Se achar que alguém entrou na sua conta, avise em até 24 horas pelo e-mail de contato.',
          ],
        },
      ],
    },
    {
      id: 'tipos-de-conta',
      title: 'Tipos de conta',
      blocks: [
        { p: '**Cidadão.** É a conta comum. É grátis. Você registra relatos, apoia, comenta e acompanha respostas.' },
        {
          p: '**Entidades, políticos e empresas.** Para responder em nome de uma prefeitura, órgão, político ou empresa, é preciso pedir o cadastro do perfil e enviar documentos para verificação. Só quem representa de fato a organização pode pedir. O acesso a esses perfis exige **verificação em duas etapas (MFA)**. Fingir ser quem você não é leva a banimento e pode ser crime.',
        },
        { p: '**Imprensa, ONGs e pesquisadores.** Podem ter acesso a recursos próprios, sempre sob as mesmas regras de conduta.' },
        { p: 'Perfis pagos têm condições próprias de contratação (preço, cancelamento, reembolso), que serão apresentadas antes da compra. **Pagar não muda o registro público.** Plano pago nunca apaga, esconde nem altera relatos, a Memória, o Votz Score ou o Mandatômetro.' },
      ],
    },
    {
      id: 'seu-conteudo',
      title: 'O que você publica',
      blocks: [
        { p: 'Tudo o que você publica (texto, foto, vídeo, áudio, localização) é **seu conteúdo**. Você continua sendo o autor, mas:' },
        {
          ul: [
            '**Você é responsável** pelo que publica. Diga a verdade, conte o que viu ou viveu e descreva fatos (o quê, onde, quando, quem deveria agir).',
            '**Você garante** que tem o direito de publicar o material (por exemplo, que a foto é sua).',
            '**Você nos dá uma licença** gratuita, sem exclusividade, para guardar, exibir, distribuir e processar o seu conteúdo no Votz e na API pública, pelo tempo em que ele existir na plataforma. Isso inclui tratamentos automáticos necessários ao serviço: transcrever áudios e comparar textos para achar relatos parecidos.',
            '**Cuidado com dados de terceiros.** Não publique CPF, telefone, endereço de casa, placa de carro, documentos ou rosto de crianças. Veja as [Diretrizes](/diretrizes).',
          ],
        },
      ],
    },
    {
      id: 'anonimato',
      title: 'Relato anônimo',
      blocks: [
        { p: 'Ao fazer um relato, você pode marcar que ele seja **anônimo**. Isso significa:' },
        {
          ul: [
            'Seu nome e seu perfil **não aparecem para ninguém**: nem para o público, nem para entidades, políticos ou empresas.',
            'O Votz **não guarda a ligação** entre você e o relato. Nem a nossa equipe consegue ver quem escreveu.',
            'Por isso, você **não recebe avisos** sobre esse relato (respostas, comentários, mudança de situação) e **não pode contestar** um “resolvido” nele. Se quiser acompanhar e contestar, faça o relato identificado.',
            '**Anonimato total na internet não existe.** Registros técnicos de acesso (como endereço IP e horário) e o próprio conteúdo que você escreve ou fotografa podem, numa investigação judicial, ajudar a chegar até você. **Evite colocar no relato informações que revelem quem você é.**',
            'Anônimo não é “sem responsabilidade”. Relato falso ou ofensivo é removido, e quem o fez pode responder por isso.',
          ],
        },
      ],
    },
    {
      id: 'memoria-publica',
      title: 'Memória pública: por que não dá para apagar relato',
      blocks: [
        { p: 'O Votz existe para manter um registro que ninguém consegue sumir com ele. Por isso:' },
        {
          ul: [
            'Depois de publicado, **você não pode apagar nem editar um relato**. Pode acrescentar informações em comentários.',
            'Cada mudança de situação do relato (aberto, em análise, resolvido, contestado…) gera um evento na **linha do tempo**, que fica guardado.',
            'Se você encerrar a sua conta, os seus relatos **continuam**, mas **sem o seu nome** (viram anônimos). Seus comentários, apoios e dados de cadastro são apagados.',
            `Se um relato tiver erro, ofender alguém ou expor dados pessoais, **peça a correção ou a remoção** pelo e-mail ${E.email}, indicando o link e o motivo. Veja a seção sobre moderação.`,
          ],
        },
        { p: 'Quem é citado em um relato tem direito de resposta. Entidades e políticos verificados podem responder pelo próprio Votz, e a resposta também fica na linha do tempo.' },
      ],
    },
    {
      id: 'regras',
      title: 'Regras de conduta',
      blocks: [
        { p: 'Você concorda em seguir as [Diretrizes da Comunidade](/diretrizes). Em resumo, **não pode**:' },
        {
          ul: [
            'mentir, inventar fatos ou acusar alguém de crime sem base;',
            'ofender, ameaçar, perseguir ou discriminar;',
            'publicar dados pessoais de outras pessoas, conteúdo sexual, ou imagens de crianças;',
            'fazer propaganda, spam, venda ou pedir voto;',
            'criar contas falsas, usar robôs ou combinar apoios falsos;',
            'tentar invadir, derrubar ou sobrecarregar o Votz, ou copiar dados em massa fora da API pública.',
          ],
        },
      ],
    },
    {
      id: 'moderacao',
      title: 'Moderação, remoção e suspensão',
      blocks: [
        { p: 'A equipe do Votz pode **remover conteúdo** e **suspender ou banir contas** que descumpram estes Termos ou as Diretrizes, ou que a lei exija remover. Sempre que possível, explicamos o motivo.' },
        {
          ul: [
            '**Ordem judicial:** removemos o conteúdo apontado em decisão judicial específica.',
            '**Imagens íntimas sem consentimento:** removemos assim que a pessoa afetada nos avisar, sem precisar de ordem judicial.',
            '**Avisos de terceiros:** quem se sentir lesado pode pedir a remoção pelo e-mail de contato. Analisamos caso a caso, em prazo razoável.',
            '**Se discordar:** você pode contestar uma decisão pelo mesmo e-mail. Reavaliamos com outra pessoa da equipe.',
          ],
        },
        { p: 'O Votz **não é obrigado a monitorar** previamente tudo o que é publicado e não responde pelo conteúdo dos usuários, salvo nos casos em que a lei diga o contrário.' },
      ],
    },
    {
      id: 'dados-publicos',
      title: 'Perfis de políticos e entidades, Votz Score e Mandatômetro',
      blocks: [
        { p: 'Mostramos informações de políticos, partidos, entidades públicas e empresas. Parte vem de **fontes públicas oficiais**, como TSE, Câmara dos Deputados, Senado Federal e IBGE. Outra parte vem do próprio uso do Votz (relatos, respostas, prazos).' },
        {
          ul: [
            'O **Votz Score** e o **Mandatômetro** são indicadores calculados automaticamente a partir dos dados do Votz. **Não são avaliação oficial** nem opinião da empresa sobre a pessoa ou organização.',
            'Podem ter erros ou atrasos. Quem identificar um erro pode pedir **correção** pelo e-mail de contato.',
            'Perfis criados a partir de dados públicos podem ser **reivindicados** pela própria pessoa ou organização, mediante verificação.',
          ],
        },
        { p: 'Não pedimos voto, não apoiamos nem atacamos partido ou candidato.' },
      ],
    },
    {
      id: 'planos-api',
      title: 'Planos pagos e API pública',
      blocks: [
        { p: 'Os pagamentos de planos são processados pela **Stripe**. Nós **não guardamos dados do seu cartão**. As condições completas de cada plano (preço, renovação, cancelamento e reembolso) serão apresentadas antes da contratação.' },
        { p: 'A **API pública** permite consultar dados públicos do Votz com uma chave pessoal. Existem limites de uso por hora, que podem mudar. É proibido revender a chave, tentar burlar os limites ou usar os dados para identificar quem fez relato anônimo. Os termos específicos da API serão publicados em documento próprio.' },
      ],
    },
    {
      id: 'propriedade',
      title: 'Propriedade intelectual',
      blocks: [
        { p: 'A marca **Votz**, o logotipo, o software e o design são de propriedade de quem opera o Votz. Você não pode copiá-los nem usá-los de forma que confunda as pessoas, sem autorização por escrito. O seu conteúdo continua sendo seu, nos termos da licença acima.' },
        { p: 'Se achar que um conteúdo viola direito autoral seu, avise pelo e-mail de contato com o link e a prova de autoria.' },
      ],
    },
    {
      id: 'responsabilidade',
      title: 'Disponibilidade e limites de responsabilidade',
      blocks: [
        {
          ul: [
            'Fazemos o possível para o Votz funcionar sempre, mas **pode haver instabilidade, manutenção ou erro**. Não garantimos funcionamento ininterrupto.',
            '**Não garantimos que seu problema será resolvido**, nem que alguém vai responder. O Votz cria registro, visibilidade e pressão.',
            'O Votz **não responde** por atos de entidades, políticos, empresas ou outros usuários, nem pelo conteúdo que eles publicam.',
            'Nada nestes Termos exclui responsabilidades que a lei não permite excluir, nem limita os direitos que você tem como consumidor.',
          ],
        },
      ],
    },
    {
      id: 'encerramento',
      title: 'Encerrar a conta',
      blocks: [
        { p: 'Você pode **encerrar a sua conta** quando quiser, em Meu perfil → Privacidade e dados. Quem tem conta com senha confirma com a senha. Quem entrou só pelo Google confirma digitando o próprio e-mail. Contas de moderadores e de perfis de entidade ou político são encerradas pelo e-mail de contato.' },
        { p: 'Podemos suspender ou encerrar contas que descumpram estes Termos, para cumprir a lei ou proteger outras pessoas. Veja na [Política de Privacidade](/privacidade) o que é apagado e o que fica.' },
      ],
    },
    {
      id: 'mudancas',
      title: 'Mudanças nos Termos',
      blocks: [
        { p: 'Podemos atualizar estes Termos. Cada versão tem número e data. Quando houver mudança importante, vamos pedir que você **aceite de novo** antes de continuar usando o Votz. Versões anteriores ficam guardadas para consulta.' },
      ],
    },
    {
      id: 'lei-foro',
      title: 'Lei aplicável e foro',
      blocks: [
        { p: `Estes Termos seguem as leis do Brasil. Para resolver conflitos, fica eleito o foro da comarca de **${E.foro}**, **ressalvado o direito do consumidor de ajuizar ação no foro do seu domicílio**.` },
      ],
    },
    {
      id: 'contato',
      title: 'Contato',
      blocks: [
        { p: `Dúvidas, pedidos de remoção, correção ou contestação: [${E.email}](mailto:${E.email}).` },
      ],
    },
  ],
}
