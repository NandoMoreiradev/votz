import { TERMS_VERSION } from '@votz/shared-types'
import { LEGAL_ENTITY as E, LEGAL_UPDATED_LABEL, type LegalDoc } from './types'

export const diretrizesDaComunidade: LegalDoc = {
  title: 'Diretrizes da Comunidade',
  version: TERMS_VERSION,
  updatedLabel: LEGAL_UPDATED_LABEL,
  summary: [
    'No Votz, **cobramos fatos, não pessoas**.',
    'Conte o que aconteceu: **o quê, onde, quando e quem deveria agir**. Se puder, mostre com foto.',
    '**Não vale:** mentira, ofensa, ameaça, dado pessoal de terceiros, propaganda, pedido de voto e conta falsa.',
    'Quem é citado tem **direito de resposta**. A resposta também fica no registro.',
    `Viu algo errado? Escreva para [${E.email}](mailto:${E.email}) com o link e o motivo.`,
  ],
  sections: [
    {
      id: 'principios',
      title: 'Nossos princípios',
      blocks: [
        {
          ul: [
            '**Direto.** Conte o problema sem rodeio.',
            '**Justo.** Os mesmos critérios valem para cidadãos, políticos, entidades e empresas. O Votz é apartidário.',
            '**Firme.** Cobrar resposta é um direito. Cobrar com respeito é o que dá força ao pedido.',
          ],
        },
      ],
    },
    {
      id: 'pode',
      title: 'O que pode e é incentivado',
      blocks: [
        {
          ul: [
            'Relatar problemas reais de serviço público ou de empresa, com data e local.',
            'Criticar um **ato, uma decisão ou um serviço**, com base em fatos.',
            'Mostrar com **fotos, vídeos e áudios** o que acontece em espaço público ou no seu próprio atendimento.',
            'Apoiar relatos de outras pessoas e comentar com informação útil.',
            'Cobrar prazo e resposta. Contestar quando um “resolvido” não estiver resolvido.',
          ],
        },
        {
          note: '**Dica de ouro:** “A UBS do bairro X está sem médico há 23 dias” é um bom relato. “O prefeito é um ladrão” não é: é ofensa, não fato.',
        },
      ],
    },
    {
      id: 'nao-pode',
      title: 'O que não pode',
      blocks: [
        {
          ol: [
            '**Mentir ou inventar.** Relato falso ou enganoso será removido.',
            '**Acusar de crime sem base.** Não chame ninguém de “corrupto”, “ladrão” ou “criminoso” sem uma decisão formal que sustente. Descreva o fato e deixe as autoridades apurarem.',
            '**Ofender, ameaçar, perseguir ou humilhar** qualquer pessoa.',
            '**Discriminar** por raça, cor, origem, religião, gênero, orientação sexual, deficiência ou idade, nem incitar ódio ou violência.',
            '**Expor dados pessoais** de terceiros: CPF, telefone, e-mail, endereço de casa, placa de carro, documentos, prontuários ou dados de saúde.',
            '**Publicar imagens de crianças e adolescentes**, ou conteúdo sexual, nudez ou violência explícita.',
            '**Fazer propaganda, vender, divulgar link duvidoso, mandar spam** ou fazer campanha. **Pedir voto ou atacar partido ou candidato** também não vale: o Votz é apartidário.',
            '**Fingir ser outra pessoa ou organização**, criar perfil falso de político, entidade ou empresa, ou usar o nome de alguém sem autorização.',
            '**Manipular apoios**: várias contas, robôs, troca de apoio combinada ou compra de apoios.',
            '**Violar direito autoral** (usar foto, vídeo ou texto de outra pessoa sem autorização).',
            '**Tentar identificar** quem fez um relato anônimo ou expor essa pessoa.',
            '**Atacar o sistema**: invadir, sobrecarregar, copiar dados em massa fora da API pública ou driblar limites.',
          ],
        },
      ],
    },
    {
      id: 'como-escrever',
      title: 'Como escrever um bom relato',
      blocks: [
        {
          ol: [
            '**Título curto e claro:** “Buraco na Rua das Flores, em frente ao nº 120”.',
            '**Descreva o fato:** o que aconteceu, desde quando e quem é afetado.',
            '**Marque o local certo** e escolha a categoria.',
            '**Mostre:** foto ou vídeo de espaço público, sem rostos e placas de terceiros.',
            '**Indique quem deveria agir**, se souber (prefeitura, hospital, empresa).',
            '**Mantenha a calma.** Relato objetivo tem mais chance de ser levado a sério.',
          ],
        },
      ],
    },
    {
      id: 'resposta-contestacao',
      title: 'Direito de resposta, correção e contestação',
      blocks: [
        {
          ul: [
            '**Resposta:** entidades, políticos e empresas verificados podem responder pelo Votz. A resposta entra na linha do tempo do relato.',
            '**Contestar:** se um relato for marcado como “resolvido” e o problema continuar, **quem fez o relato** pode contestar. A contestação é analisada pela moderação.',
            '**Correção:** se um relato tiver erro de fato, quem foi citado pode pedir correção ou remoção, com explicação e, se possível, prova.',
            '**Memória:** o Votz mantém o registro de fatos de interesse público, mesmo que desagradem a alguém. Não apagamos relato apenas porque a pessoa ou organização citada não gostou.',
          ],
        },
      ],
    },
    {
      id: 'moderacao',
      title: 'Como funciona a moderação',
      blocks: [
        { p: 'A equipe do Votz analisa conteúdos e denúncias. Dependendo da gravidade e de a pessoa já ter errado antes, podemos:' },
        {
          ul: [
            '**remover** o conteúdo;',
            '**suspender** a conta por um tempo;',
            '**banir** a conta de forma definitiva;',
            '**encaminhar às autoridades**, quando houver risco à vida, à segurança ou possível crime.',
          ],
        },
        {
          ul: [
            'Sempre que possível, **explicamos o motivo**.',
            `**Se discordar**, responda por e-mail para [${E.email}](mailto:${E.email}). Outra pessoa da equipe revê a decisão.`,
            '**Removemos imediatamente** imagens íntimas divulgadas sem consentimento, assim que a pessoa afetada avisar.',
            'Cumprimos **ordens judiciais** de remoção que apontem o conteúdo específico.',
          ],
        },
      ],
    },
    {
      id: 'denunciar',
      title: 'Como avisar sobre um problema',
      blocks: [
        { p: `Escreva para [${E.email}](mailto:${E.email}) com: o **link do relato ou comentário**, o **motivo** e, se tiver, a **prova**. Em risco imediato, ligue 190, 192 ou 193.` },
      ],
    },
    {
      id: 'organizacoes',
      title: 'Regras para entidades, políticos e empresas',
      blocks: [
        {
          ul: [
            'Só representantes autorizados podem responder em nome da organização. A verificação e o MFA são obrigatórios.',
            '**Não é permitido** marcar como “resolvido” o que não foi resolvido, usar respostas falsas ou tentar apagar o registro.',
            '**Plano pago não compra silêncio.** Nenhum plano remove relatos, muda a linha do tempo ou altera o Votz Score.',
            'Cobrança pública não é ataque pessoal. Responda aos fatos, com prazo e ação.',
          ],
        },
      ],
    },
    {
      id: 'mudancas',
      title: 'Mudanças',
      blocks: [
        { p: 'Estas Diretrizes fazem parte dos [Termos de Uso](/termos) e podem mudar. Cada versão tem número e data, e mudanças importantes pedem novo aceite.' },
      ],
    },
  ],
}
