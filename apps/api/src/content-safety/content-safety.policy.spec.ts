import { FlagReason } from '@prisma/client'
import {
  containsPersonalPhone,
  containsValidCpf,
  decideSafetyAction,
  evaluateTextSync,
  normalizeForSafety,
  sanitizeSafetyAnalysis,
} from './content-safety.policy'

describe('content-safety.policy', () => {
  describe('normalizeForSafety', () => {
    it('remove acentos, converte leetspeak, junta letras espaçadas e colapsa repetições', () => {
      expect(normalizeForSafety('Pooooorra!!').collapsed).toBe('pora')
      expect(normalizeForSafety('f.d.p').normalized).toBe('fdp')
      expect(normalizeForSafety('p u t a').normalized).toBe('puta')
      expect(normalizeForSafety('v4g4bund0').normalized).toBe('vagabundo')
    })

    it('não corrompe números puros (protocolos, datas, endereços)', () => {
      expect(normalizeForSafety('Rua 15 de novembro nº 403').normalized).toBe('rua 15 de novembro n 403')
    })
  })

  describe('containsValidCpf e containsPersonalPhone', () => {
    it('bloqueia CPF válido (com ou sem pontuação) e ignora número aleatório de 11 dígitos', () => {
      expect(containsValidCpf('O CPF do vizinho é 529.982.247-25')).toBe(true)
      expect(containsValidCpf('CPF 52998224725')).toBe(true)
      expect(containsValidCpf('Protocolo 12345678900 da prefeitura')).toBe(false)
      expect(containsValidCpf('Número 111.111.111-11')).toBe(false)
    })

    it('detecta celular pessoal com DDD e ignora telefones públicos', () => {
      expect(containsPersonalPhone('Liguem para (11) 98765-4321 agora')).toBe(true)
      expect(containsPersonalPhone('Ligue 156 ou 0800 123 4567')).toBe(false)
    })
  })

  describe('evaluateTextSync (Camada 1)', () => {
    it('permite relatos cívicos firmes e não gera falso positivo em palavras parecidas', () => {
      const ok = evaluateTextSync([
        'Assalto frequente perto do esgoto a céu aberto',
        'A disputa pelo contrato de computador da UBS deixou o bairro sem atendimento há 20 dias.',
      ], 'relato')
      expect(ok.blocked).toBe(false)
      expect(ok.softCategories).toEqual([])
    })

    it('bloqueia palavrão pesado, evasão com pontos/asteriscos, ameaça, ódio e CPF válido', () => {
      expect(evaluateTextSync(['Prefeitura f.d.p não faz nada'], 'relato')).toMatchObject({
        blocked: true,
        blockCategory: 'profanity_insult',
      })
      expect(evaluateTextSync(['Que p*rra de buraco na rua'], 'relato')).toMatchObject({
        blocked: true,
        blockCategory: 'profanity_insult',
      })
      expect(evaluateTextSync(['Esse gestor tem que morrer'], 'comentário')).toMatchObject({
        blocked: true,
        blockCategory: 'threat_violence',
      })
      expect(evaluateTextSync(['Volta pra senzala'], 'publicação')).toMatchObject({
        blocked: true,
        blockCategory: 'hate_speech',
      })
      expect(evaluateTextSync(['O responsável tem CPF 529.982.247-25'], 'relato')).toMatchObject({
        blocked: true,
        blockCategory: 'personal_data',
      })
    })

    it('não bloqueia termos contextuais (ladrão/corrupto/celular), mas marca softCategories para triagem', () => {
      const res = evaluateTextSync([
        'O secretário é um corrupto, liguem no (21) 99876-5432',
      ], 'relato')
      expect(res.blocked).toBe(false)
      expect(res.softCategories).toEqual(expect.arrayContaining(['defamation', 'personal_data']))
    })
  })

  describe('sanitizeSafetyAnalysis e decideSafetyAction (Camada 2)', () => {
    it('descarta categorias inventadas pelo modelo e limita explicação', () => {
      const parsed = sanitizeSafetyAnalysis({
        findings: [
          { category: 'hate_speech', confidence: 0.92 },
          { category: 'categoria_inventada', confidence: 1 },
        ],
        confidence: 0.9,
        explanation: '  Contém injúria discriminatória.  ',
      })
      expect(parsed).toEqual({
        findings: [{ category: 'hate_speech', confidence: 0.92 }],
        confidence: 0.9,
        explanation: 'Contém injúria discriminatória.',
      })
    })

    it('coloca em QUARANTINE abuso grave com confiança >= 0.85', () => {
      const sync = evaluateTextSync(['texto qualquer'])
      const decision = decideSafetyAction(
        {
          findings: [{ category: 'threat_violence', confidence: 0.91 }],
          confidence: 0.91,
          explanation: 'Ameaça direta de agressão física.',
        },
        sync,
      )
      expect(decision.action).toBe('QUARANTINE')
      expect(decision.reason).toBe(FlagReason.SEXUAL_OR_VIOLENT)
    })

    it('abre FLAG_FOR_REVIEW para suspeita média (0.50..0.84) sem quarentena', () => {
      const sync = evaluateTextSync(['texto qualquer'])
      const decision = decideSafetyAction(
        {
          findings: [{ category: 'defamation', confidence: 0.7 }],
          confidence: 0.75,
          explanation: 'Acusação direta contra servidor sem base factual.',
        },
        sync,
      )
      expect(decision.action).toBe('FLAG_FOR_REVIEW')
      expect(decision.reason).toBe(FlagReason.OFFENSIVE)
    })

    it('faz fallback para FLAG_FOR_REVIEW por regras quando IA está indisponível e há alerta contextual', () => {
      const sync = evaluateTextSync(['O diretor é um corrupto incompetente'])
      const decision = decideSafetyAction(null, sync)
      expect(decision.action).toBe('FLAG_FOR_REVIEW')
      expect(decision.reason).toBe(FlagReason.OFFENSIVE)
    })
  })
})
