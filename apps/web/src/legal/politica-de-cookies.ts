import { PRIVACY_VERSION } from '@votz/shared-types'
import { LEGAL_ENTITY as E, LEGAL_UPDATED_LABEL, type LegalDoc } from './types'

export const politicaDeCookies: LegalDoc = {
  title: 'Política de Cookies',
  version: PRIVACY_VERSION,
  updatedLabel: LEGAL_UPDATED_LABEL,
  summary: [
    'O Votz usa **um único cookie**, e ele serve só para **manter você conectado**.',
    '**Não usamos** cookies de publicidade, de rastreamento nem de análise de audiência.',
    'Por isso **não mostramos faixa de aceitar cookies**: o cookie que usamos é necessário para o site funcionar.',
    'Se um dia usarmos algum cookie que não seja necessário, **vamos pedir sua permissão antes**.',
  ],
  sections: [
    {
      id: 'o-que-sao',
      title: 'O que são cookies',
      blocks: [
        { p: 'Cookies são pequenos arquivos que o site guarda no seu navegador. Eles ajudam o site a lembrar de você entre uma visita e outra. Neste documento falamos também de um recurso parecido, o armazenamento local do navegador.' },
      ],
    },
    {
      id: 'o-que-usamos',
      title: 'O que o Votz guarda no seu navegador',
      blocks: [
        {
          table: {
            head: ['Nome', 'Tipo', 'Para que serve', 'Quanto tempo', 'Precisa de permissão?'],
            rows: [
              ['`votz_refresh_token`', 'Cookie próprio', 'Mantém você conectado sem pedir a senha a toda hora. Só é enviado ao servidor do Votz, em conexão segura, e o site não consegue ler o conteúdo dele.', 'Até 7 dias', 'Não, é estritamente necessário'],
              ['`votz:auth`', 'Armazenamento local', 'Guarda seus dados básicos de perfil (nome, tipo de conta, aceite dos termos) e o perfil que você está usando, para o site abrir já logado.', 'Até você sair da conta ou limpar o navegador', 'Não, é necessário'],
            ],
          },
        },
        { p: 'A credencial de acesso de curta duração fica só na memória da página e some quando você a fecha.' },
        { note: 'Não usamos Google Analytics, Meta Pixel, nem qualquer ferramenta de publicidade ou de monitoramento de comportamento.' },
      ],
    },
    {
      id: 'terceiros',
      title: 'Serviços de terceiros que você pode acionar',
      blocks: [
        { p: 'Algumas partes do Votz carregam recursos de outras empresas. Ao usá-las, essas empresas podem receber dados técnicos do seu navegador, como o endereço IP, e aplicar a política de privacidade delas:' },
        {
          ul: [
            '**Mapa** (MapTiler): quando você abre o mapa.',
            '**Login com Google**: quando você clica em entrar com Google.',
            '**Pagamento** (Stripe): quando você contrata um plano.',
            '**Debates ao vivo** (LiveKit): quando você assiste ou participa de um debate.',
            '**Busca de CEP** (BrasilAPI): quando você digita o CEP.',
          ],
        },
        { p: 'As fontes de letra do Votz ficam hospedadas no nosso próprio site. Elas **não são buscadas no Google**.' },
      ],
    },
    {
      id: 'controle',
      title: 'Como controlar',
      blocks: [
        { p: 'Você pode apagar ou bloquear cookies nas configurações do seu navegador. Se bloquear o cookie `votz_refresh_token`, você será desconectado com mais frequência e pode não conseguir manter o login.' },
        { p: 'Para saber o que fazemos com seus dados, leia a [Política de Privacidade](/privacidade).' },
      ],
    },
    {
      id: 'mudancas',
      title: 'Mudanças e contato',
      blocks: [
        { p: 'Se passarmos a usar outros cookies, atualizaremos esta página e, quando a lei exigir, pediremos o seu consentimento antes.' },
        { p: `Dúvidas: [${E.email}](mailto:${E.email}).` },
      ],
    },
  ],
}
