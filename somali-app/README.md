# Af Soomaali

Application web **local-first** d'apprentissage du somali pour francophones, orientée
**conversation familiale du quotidien**.

Tout est stocké dans le navigateur (IndexedDB). Aucun backend, aucun compte, aucune
dépendance payante. L'application est conçue pour que **vous alimentiez vous-même le
contenu audio** à partir d'enregistrements de proches locuteurs natifs.

> **État actuel : phases 1 et 2 livrées** — socle technique, session de révision
> (3 modes), répertoire, réglages FSRS et import JSON. Les phases 3 à 5 sont
> décrites plus bas.

> **Astuce VPS / performances** : `npm run dev` compile chaque page à la volée et
> paraît lent. Pour un usage réel, servez le build de production :
> `npm run build && npm start -- -p 3001`.

---

## Sommaire

- [Lancer en local](#lancer-en-local)
- [Architecture](#architecture)
- [Règle sur le contenu linguistique](#règle-sur-le-contenu-linguistique)
- [Ajouter du contenu en masse](#ajouter-du-contenu-en-masse)
- [Le moteur de révision](#le-moteur-de-révision)
- [Synthèse vocale (TTS) — état réel](#synthèse-vocale-tts--état-réel)
- [Export vers Anki](#export-vers-anki)
- [Feuille de route](#feuille-de-route)

---

## Lancer en local

Prérequis : Node.js 20 ou plus.

```bash
cd somali-app
npm install
npm run dev          # http://localhost:3000
```

Autres commandes :

```bash
npm run test         # tests unitaires (Vitest)
npm run test:watch   # mode watch
npm run typecheck    # TypeScript strict, sans émission
npm run build        # build de production
npm start            # sert le build de production
```

### Déploiement Vercel

L'application vit dans le sous-dossier `somali-app/` du dépôt. Sur Vercel, réglez
**Root Directory** sur `somali-app`. Aucune variable d'environnement n'est requise :
tout fonctionne hors ligne, sans service externe.

---

## Architecture

```
somali-app/
├─ src/
│  ├─ app/                    # routes Next.js (App Router)
│  │  ├─ page.tsx             # tableau de bord
│  │  ├─ reviser/             # Xasuus — session de révision      (phase 2)
│  │  ├─ repertoire/          # Ereyada — répertoire audio         (phase 2)
│  │  ├─ prononciation/       # Dhawaaq — prononciation            (phase 3)
│  │  └─ reglages/            # réglages, export, sauvegarde       (phase 2/4)
│  ├─ components/
│  └─ lib/
│     ├─ db/
│     │  ├─ types.ts          # modèle de données complet
│     │  ├─ db.ts             # schéma Dexie (IndexedDB)
│     │  └─ repo.ts           # accès aux données, import, révisions
│     ├─ srs/
│     │  ├─ engine.ts         # moteur FSRS (ts-fsrs)
│     │  ├─ queue.ts          # construction de la file de session
│     │  └─ defaults.ts       # réglages par défaut
│     ├─ content/somali.ts    # orthographe somalie, phonèmes, recherche
│     └─ date.ts              # jours, séries
```

**Stack** : Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 4 ·
Dexie 4 (IndexedDB) · ts-fsrs 5 · Vitest.

### Modèle de données

| Table | Contenu |
| --- | --- |
| `entries` | Phrases : somali, français, thème, niveau, `source`, `verified`, phonèmes |
| `cards` | Une carte par (phrase × mode). État FSRS à plat. |
| `reviewLogs` | Journal de toutes les révisions — base du rétro-calcul |
| `audio` | Blobs audio (importés, découpés, votre voix, TTS) |
| `recordings` | Enregistrements longs, avant découpage |
| `phonemeStats` | Taux de réussite par phonème |
| `dailyStats` | Révisions, nouvelles cartes, temps d'écoute par jour |
| `settings` | Réglages (un seul enregistrement) |

Chaque phrase engendre **trois cartes**, une par mode de révision. Les identifiants
sont déterministes (`<entryId>:<mode>`) : réimporter une phrase ne duplique jamais
ses cartes.

---

## Règle sur le contenu linguistique

**Aucun contenu somali n'est inventé par l'application.**

- Toute entrée porte un champ `source` **obligatoire** : une phrase sans provenance
  est rejetée à l'import.
- Toute entrée porte `verified: boolean`, à `false` par défaut. L'import force cette
  valeur à `false` sauf mention explicite, et émet alors un avertissement.
- L'interface affiche un badge sur toute carte non vérifiée, et un bouton
  « valider » à activer **après confirmation par un locuteur natif**.
- Le tableau de bord compte en permanence les entrées restant à valider.

### Orthographe

L'orthographe latine officielle du somali (alphabet Farmaajo, 1972) est respectée :

- voyelles longues **doublées** : `aa`, `ee`, `ii`, `oo`, `uu` ;
- consonnes propres au somali : `c` (ʿayn), `x`, `q`, `dh`, `kh`, `sh` ;
- lettres **absentes** de l'alphabet : `p`, `v`, `z` — leur présence déclenche un
  avertissement à l'import (transcription probablement fautive).

Les digrammes `dh`, `kh`, `sh` et les voyelles longues sont traités comme des unités
indivisibles par l'analyse (`src/lib/content/somali.ts`) : `dhagax` se découpe en
`dh·a·g·a·x`, jamais en `d·h·…`.

---

## Ajouter du contenu en masse

Le contenu s'ajoute via un fichier **JSON** : un tableau d'objets, un objet par
phrase.

```json
[
  {
    "somali": "Subax wanaagsan",
    "french": "Bonjour (le matin)",
    "theme": "salutations",
    "level": 1,
    "source": "Ressource X, p. 12",
    "notes": "Réponse usuelle : Subax wanaagsan.",
    "literal": "matin bon",
    "tags": ["matin", "usuel"]
  }
]
```

### Champs

| Champ | Obligatoire | Détail |
| --- | --- | --- |
| `somali` | oui | Phrase entière, orthographe officielle |
| `french` | oui | Traduction française |
| `theme` | oui | Voir la liste ci-dessous |
| `source` | oui | Référence de la ressource — toute phrase doit être traçable |
| `level` | non | `1`, `2` ou `3` (défaut : `1`) |
| `notes` | non | Registre, remarque grammaticale, variante |
| `literal` | non | Découpage mot à mot |
| `tags` | non | Tableau de chaînes |
| `verified` | non | **Laisser à `false`** tant qu'un natif n'a pas confirmé |

**Thèmes acceptés** : `salutations`, `famille`, `nourriture`, `marche`, `telephone`,
`temps`, `deplacements`, `sante`, `politesse`, `chiffres`, `questions`, `expressions`.

### Comportement de l'import

- Une ligne invalide (champ obligatoire manquant, thème inconnu) est **rejetée** ;
  les autres passent. Un rapport détaille chaque problème avec son numéro de ligne.
- Les doublons (même somali **et** même français, à la casse et aux accents près)
  sont ignorés — un même fichier peut donc être réimporté sans risque.
- Chaque phrase importée crée automatiquement ses trois cartes de révision.

**En pratique** : Réglages → « Import en masse (JSON) » → choisir le fichier. Le
rapport d'import s'affiche à l'écran, ligne par ligne. On peut aussi ajouter les
phrases une à une depuis l'écran Ereyada (« + Ajouter une phrase »).

---

## Le moteur de révision

### FSRS, pas SM-2

L'ordonnancement utilise **FSRS** via `ts-fsrs` : les 21 poids du modèle, la
rétention visée, l'intervalle maximal et les paliers d'apprentissage sont tous
ajustables depuis les réglages.

**Rétro-calcul** : `recomputeCard()` rejoue l'intégralité du journal d'une carte avec
les paramètres courants. À utiliser après avoir changé la rétention visée ou les
poids — sans quoi la planification existante reste calée sur les anciens paramètres.

### Cartes basées sur des phrases

Une carte porte toujours sur une **phrase entière**, jamais sur un mot isolé. Le
somali s'articule autour de particules (`waa`, `baa`, `ayaa`) qui n'ont aucun sens
hors contexte.

### Les trois modes

| Mode | Question → réponse |
| --- | --- |
| **Reconnaissance** | Somali écrit → sens français |
| **Production** | Français → dire la phrase à voix haute, puis auto-évaluation contre l'audio |
| **Écoute pure** | Audio seul, sans texte → sens |

Les trois modes sont alternés automatiquement et la file évite d'enchaîner deux
cartes issues de la même phrase (sinon la seconde se répondrait toute seule).

### Plafonds

- Nouvelles cartes par jour : **10 par défaut**, ajustable. Le compte porte sur les
  *cartes* : à trois cartes par phrase, 10 correspond à environ 3 phrases nouvelles
  par jour.
- Révisions par jour : illimité par défaut (`0`).

---

## Synthèse vocale (TTS) — état réel

**À compléter en phase 3.** L'état réel du support du somali chez les différents
fournisseurs de synthèse vocale sera vérifié fournisseur par fournisseur et
documenté ici, sans supposition.

Ce qui est déjà acquis, quel que soit le résultat de cette vérification :
l'application **fonctionne intégralement sans aucun TTS**. Le réglage `ttsProvider`
vaut `none` par défaut, et l'architecture `AudioProvider` prévue en phase 3 place
`LocalFileProvider` (fichiers audio importés) comme implémentation par défaut, avec
`RecordedProvider` (enregistrements de proches) et un `TTSProvider` strictement
optionnel.

---

## Export vers Anki

**À livrer en phase 4** : export CSV/TSV (séparateur configurable ; champs Somali,
Français, Notes, Audio), archive ZIP des médias au format `[sound:nom.mp3]`, écran
d'instructions pas-à-pas, et export/import complet de la base en JSON.

---

## Feuille de route

| Phase | Contenu | État |
| --- | --- | --- |
| 1 | Scaffold, modèle Dexie, moteur FSRS + tests | **livrée** |
| 2 | Session de révision (3 modes), répertoire, réglages, import JSON | **livrée** |
| 3 | Enregistrement, import audio, découpage, module Dhawaaq | à venir |
| 4 | Export Anki (CSV + ZIP), sauvegarde JSON | à venir |
| 5 | PWA hors ligne, installable, jeu de 30 phrases de départ | à venir |

### Ce que couvre la phase 2

- **Session de révision** (`/reviser`) : les trois modes alternés, aperçu des quatre
  intervalles sur les boutons de note, annulation de la dernière note, remise en
  file des cartes en palier court, badge sur les phrases non vérifiées. Une carte
  « écoute pure » n'apparaît que si sa phrase a de l'audio.
- **Répertoire** (`/repertoire`) : recherche instantanée somali/français (accents
  ignorés), filtres thème/niveau/statut, favoris, validation par locuteur natif
  (nom mémorisé), ajout manuel avec contrôle d'orthographe, suppression en cascade.
- **Réglages** (`/reglages`) : plafonds quotidiens, modes actifs, rétention visée,
  **rétro-calcul global**, import JSON avec rapport détaillé, thème sombre/clair.

### Couverture des tests

97 tests Vitest sur le moteur SRS et la couche de données :

- `src/lib/srs/engine.test.ts` — notation, paliers, oublis, annulation, oubli forcé,
  rétention, rétro-calcul, formatage des intervalles ;
- `src/lib/srs/queue.test.ts` — plafonds, tri par échéance, modes, espacement des
  cartes sœurs, prévision de charge ;
- `src/lib/srs/session.test.ts` — filtrage des cartes « écoute » sans audio,
  plafond quotidien à cheval sur plusieurs sessions, annulation de révision ;
- `src/lib/db/repo.test.ts` — CRUD, cascade de suppression, recherche, import en
  masse et ses rejets, enregistrement des révisions ;
- `src/lib/content/somali.test.ts` — digrammes, voyelles longues, alphabet ;
- `src/lib/date.test.ts` — jours et séries.

S'y ajoute un scénario navigateur complet (Playwright, non commité) exécuté à
chaque phase : ajout, recherche, validation, session entière, annulation, import
JSON, rétro-calcul, bascule de thème.
