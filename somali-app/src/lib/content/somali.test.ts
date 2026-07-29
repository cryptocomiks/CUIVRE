import { describe, expect, it } from 'vitest'
import {
  detectPhonemes,
  graphemes,
  invalidCharacters,
  normalizeForSearch,
} from './somali'

describe('graphemes', () => {
  it('garde les digrammes dh, kh et sh intacts', () => {
    expect(graphemes('dhagax')).toEqual(['dh', 'a', 'g', 'a', 'x'])
    expect(graphemes('khamiis')).toEqual(['kh', 'a', 'm', 'ii', 's'])
    expect(graphemes('shan')).toEqual(['sh', 'a', 'n'])
  })

  it('traite les voyelles longues comme une unité', () => {
    expect(graphemes('caano')).toEqual(['c', 'aa', 'n', 'o'])
    expect(graphemes('buug')).toEqual(['b', 'uu', 'g'])
    expect(graphemes('iimaan')).toEqual(['ii', 'm', 'aa', 'n'])
  })

  it('distingue voyelle courte et voyelle longue', () => {
    expect(graphemes('bad')).toEqual(['b', 'a', 'd'])
    expect(graphemes('baad')).toEqual(['b', 'aa', 'd'])
  })
})

describe('detectPhonemes', () => {
  it('repère les consonnes absentes du français', () => {
    expect(detectPhonemes('caano')).toContain('c')
    expect(detectPhonemes('xaggee')).toContain('x')
    expect(detectPhonemes('qaxwo')).toContain('q')
    expect(detectPhonemes('khamiis')).toContain('kh')
    expect(detectPhonemes('dhagax')).toContain('dh')
  })

  it('ne confond pas dh avec d suivi de h', () => {
    expect(detectPhonemes('dhow')).toEqual(['dh'])
  })

  it('regroupe les voyelles longues sous une seule étiquette', () => {
    expect(detectPhonemes('buug caano')).toEqual(['c', 'long-vowel'])
  })

  it('ne renvoie rien pour une phrase sans difficulté', () => {
    expect(detectPhonemes('nin yar')).toEqual([])
  })

  it('relève la voyelle longue de « waa », particule omniprésente', () => {
    expect(detectPhonemes('waa run')).toEqual(['long-vowel'])
  })

  it('ne produit aucun doublon', () => {
    const found = detectPhonemes('qaxwo qaraar qiimo')
    expect(found).toEqual([...new Set(found)])
  })
})

describe('normalizeForSearch', () => {
  it('retire les accents et met en minuscules', () => {
    expect(normalizeForSearch('Combien ça coûte ?')).toBe('combien ca coute')
    expect(normalizeForSearch('Élève')).toBe('eleve')
  })

  it('normalise les espaces', () => {
    expect(normalizeForSearch('  Subax   wanaagsan  ')).toBe('subax wanaagsan')
  })

  it('conserve l’apostrophe des mots somalis', () => {
    expect(normalizeForSearch("ma'aha")).toBe("ma'aha")
  })
})

describe('invalidCharacters', () => {
  it('accepte l’alphabet somali officiel', () => {
    expect(invalidCharacters('Waxaan doonayaa qaxwo, mahadsanid!')).toEqual([])
    expect(invalidCharacters('Dhagaxu waa culus yahay.')).toEqual([])
  })

  it('signale les lettres absentes de l’alphabet somali', () => {
    expect(invalidCharacters('pizza')).toEqual(expect.arrayContaining(['p', 'z']))
    expect(invalidCharacters('avion')).toContain('v')
  })

  it('signale les caractères accentués', () => {
    expect(invalidCharacters('café')).toContain('é')
  })
})
