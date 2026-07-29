import { describe, expect, it } from 'vitest'
// @ts-expect-error — script Node en JS pur, sans déclaration de types.
import { parseLesson, parseLessonTitle, stripTags } from '../../../scripts/fetch-50languages.mjs'

/**
 * Fixtures reconstruites d'après les deux mises en page connues de
 * 50languages.com (scrapers publics abdnh/50langs2anki, 2023, et
 * triton11/50-Languages-Book2-to-Flashcards, 2024). Le script tournera chez
 * l'utilisateur : on fige ici le comportement attendu sur les deux variantes.
 */

const LAYOUT_2023 = `
<html><title>Faire connaissance | français - somali</title><body>
<table class="table">
<tr><td>Salut !</td>
    <td><span>a</span><span>b</span><span>c</span><span>d</span><span>Haye!</span></td>
    <td><a offset_text="42" href="#"></a></td></tr>
<tr><td>Bonjour !</td>
    <td><span>a</span><span>b</span><span>c</span><span>d</span><span>Maalin wanaagsan!</span></td>
    <td><a offset_text="43" href="#"></a></td></tr>
<tr><td></td><td><span>vide</span></td><td><a offset_text="99"></a></td></tr>
</table></body></html>`

const LAYOUT_2024 = `
<html><title>La famille</title><body>
<table id="table1">
<tr>
  <td class="nativee_txtt mb-mob-0">le grand-père</td>
  <td class="left-dr target-phrase">
    <span class="transliteration-text default_phrase">awoowe (translit)</span>
    <span class="default_phrase">awoowe</span>
  </td>
  <td class="justify-content-center-mob">
    <audio><source src="https://www.book2.nl/book2/SO/SOUND/301.mp3"></audio>
  </td>
</tr>
<tr>
  <td class="nativee_txtt mb-mob-0">la grand-mère</td>
  <td class="left-dr target-phrase">
    <span class="default_phrase">ayeeyo</span>
  </td>
  <td class="justify-content-center-mob">
    <audio><source src="https://www.book2.nl/book2/SO/SOUND/302.mp3"></audio>
  </td>
</tr>
</table></body></html>`

describe('parseLesson — mise en page 2023 (.table + offset_text)', () => {
  it('extrait les paires et les identifiants audio', () => {
    const rows = parseLesson(LAYOUT_2023)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ fr: 'Salut !', so: 'Haye!', soundId: '42' })
    expect(rows[1]).toEqual({ fr: 'Bonjour !', so: 'Maalin wanaagsan!', soundId: '43' })
  })
})

describe('parseLesson — mise en page 2024 (table1 + classes)', () => {
  it('extrait le texte cible sans la translittération', () => {
    const rows = parseLesson(LAYOUT_2024)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ fr: 'le grand-père', so: 'awoowe', soundId: '301' })
    expect(rows[1]).toEqual({ fr: 'la grand-mère', so: 'ayeeyo', soundId: '302' })
  })
})

describe('parseLesson — robustesse', () => {
  it('ignore les rangées sans identifiant audio', () => {
    expect(parseLesson('<tr><td>x</td><td>y</td></tr>')).toEqual([])
  })

  it('ne renvoie rien sur une page sans table', () => {
    expect(parseLesson('<html><body><p>404</p></body></html>')).toEqual([])
  })
})

describe('stripTags / parseLessonTitle', () => {
  it('nettoie balises et entités', () => {
    expect(stripTags('<b>l&#39;eau</b> &amp; le th&eacute;'.replace('&eacute;', 'é'))).toBe(
      "l'eau & le thé",
    )
  })

  it('lit le titre de page', () => {
    expect(parseLessonTitle(LAYOUT_2023)).toContain('Faire connaissance')
  })
})
