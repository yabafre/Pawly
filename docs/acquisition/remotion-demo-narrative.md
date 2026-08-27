# 🎬 Script vidéo Pawly — « Le calme retrouvé »

> **v2 — réécriture hook-first, orientée conversion.** Design-partner. **52 s**, VO française (voix fondateur).
> Direction gagnante d'une compétition créative (4 directions → panel de 4 juges dont un gardien de marque) — `le-calme-retrouvé` + hook proof-first greffé de `la-preuve-en-un-geste`.
> Ancré sur le **vrai DS** (tokens exacts, Inter + Geist Mono), le **brand board « Clinique Zen »** (Hygiène · Précision · Douceur) et le **langage motion réel** de l'app (framer-motion, AnimatedBeam, AnimatedGradientBackground, count-ups).

---

## 🎯 Direction créative — « Clinique Zen par la retenue »

Le film se comporte **comme le produit** : hygiénique, ordonné, confiance tranquille. Le diagnostic de la v1 : elle faisait « template AI » et **contredisait la marque** (Excel qui tremble, collisions, vacuum, cartes pastel). Ici, **la retenue EST le geste pro**.

**Palette — strictement on-token, zéro couleur hors-DS sauf 2 signaux volontaires :**
- Surface : Warm Linen `#FAF9F7` · cartes `#FCFCFC` · Soft Black `#1A1A1A` · muted-fg `#6B6B6B` · border `#E8E5E0`
- Structure & chrome produit : **Vet Teal `#009588` uniquement** (bouton générer, HealthBar saine, check publié, confirmer)
- **Signal 1 (le wedge)** : la vraie cellule École `#FAF5FF`/`#E9D5FF`/`#7E22CE` + GraduationCap — **uniquement** sur le mardi de Léa, jamais ailleurs → ça reste un signal, pas une déco. Un seul halo doré `#F5B400` pulse une fois au verrouillage.
- **Signal 2 (humanise)** : Vital Orange `#F97316` **uniquement** sur le beat humain/invitation (un mot souligné). Jamais sur la structure produit.
- HealthBar honnête : rose `#F43F5E` (conflit) · orange `#FB923C` (avertissement) · muted rayé (trou) · teal (sain).
- Fonts : **Inter** (400/600/700) pour la voix et l'UI · **Geist Mono** strictement pour la donnée (compteur, % prêt, +7h, heures).

**4 signatures motion (le motion réel de l'app, répliqué en Remotion) :**
1. **UNE** respiration : un seul radial teal-wash (`#E0F2F1`→`#FAF9F7`) qui inspire/expire 3-5% sur ~6-8s, présent en fond de **chaque** scène à faible opacité. Le film respire comme une seule surface.
2. **UN** spring partout : `stiffness 300 / damping 30`, stagger 40 ms/item, ease-out à l'entrée / ease-in court (~65%) à la sortie, scale 0.97-1.03 au press, crossfade pour remplacer un contenu. Le film = un seul instrument, pas un montage.
3. **UN** count-up : le même `Math.round(interpolate(frame))` porte **tous** les chiffres (compteur de coût → +7h → % prêt → 100%). Pas de 2e montage de stats.
4. **UN** beam qui a du sens : un seul tracé SVG (easeOutExpo `[0.16,1,0.3,1]`) qui dessine la cause→effet du jour d'école au créneau contourné.

**Philosophie de retenue :** **1-2 éléments animés par beat, le reste figé.** C'est l'immobilité du décor qui rend le mouvement clinique et crédible. Le motion est **toujours** cause→effet. **Rien de décoratif ne survit** : pas de shake, pas de collision, pas de vacuum, pas de pastel, pas de hors-palette. La tension est montrée **une fois**, brièvement, comme un segment rose bien rangé — **de la donnée, jamais du chaos** — et se résout assez vite pour que le **soulagement** soit le souvenir dominant.

## ⚡ Le hook (< 6s) — pourquoi un gérant ne scrolle pas

**Hook en 2 temps :**
- **0-2s — le coût.** Un compteur Geist-Mono `03:47:12` qui monte sur Warm Linen, label « temps passé sur le planning cette semaine », puis il **gèle** et la ligne s'incruste : « Encore un dimanche soir sur Excel ? ». Le timer, ce sont *ses propres heures perdues*, nommées dans ses mots — avant tout logo.
- **2-6s — la preuve.** Un clic, et la cellule MARDI de **Léa Martin · APPRENTIE** se **verrouille en premier** en violet « École » pendant que la grille se remplit autour. En 6 secondes : sa douleur nommée **ET** le truc exact qu'il bricole à la main, résolu automatiquement, avec un vrai prénom et un vrai jour. **De la preuve, pas de la promesse.**

---

## Découpage scène par scène (52 s)

| # | t | Scène | À l'écran | VO (français) | Motion (1-2 éléments) |
|---|---|-------|-----------|---------------|------------------------|
| 1 | 0–2 | **Le coût** | Compteur `03:47:12` Geist-Mono qui monte, label « temps passé sur le planning cette semaine » ; gèle à ~1,4s, la ligne « Encore un dimanche soir sur Excel ? » se crossfade | « Combien d'heures, cette semaine, sur le planning de l'équipe ? » | Count-up → freeze ; 1 crossfade ligne. Rien d'autre ne bouge |
| 2 | 2–7 | **Un clic — la preuve** | StaffGrid calme (`juin 2026`), curseur presse le bouton teal « Générer le planning » ; la grille se peuple en vague **sauf** le MARDI de **Léa · APPRENTIE** qui se verrouille **en 1er** en violet « École » (GraduationCap + halo doré) | « Avec Pawly, un clic. Et le mardi de Léa reste à l'école. » | Press scale 0.97 ; cellule École verrouillée **avant** la vague (spring qui démarre 8 frames plus tôt) + 1 pulse de halo |
| 3 | 7–12 | **Le pourquoi** | 3 libellés Geist-Mono à gauche (« Repos légal · Disponibilités · Jours d'école ») → 3 beams fins se dessinent vers la grille puis s'estompent ; zoom doux sur Léa, badge `+7h école` | « Pas une grille au hasard : repos légal, disponibilités, équité — et les jours d'école des apprentis en alternance. » | 3 beams (stroke-dashoffset, easeOutExpo, stagger 40ms) puis fade ; badge +7h scale-in |
| 4 | 12–17 | **Déclaré une fois** | Le vrai `ApprenticeDeclarationPanel` : chip de statut « Déclaration manquante » (rose) → « Jours d'école fournis » (teal), check qui se dessine | « Parce que l'apprentie déclare ses jours d'école une seule fois. Ensuite, Pawly s'en souvient. » | **Un seul** élément animé : le chip (crossfade rose→teal + check path-draw) |
| 5 | 17–24 | **La vérité** | `PlanningHealthBar` qui monte : segment rose (conflit) + orange (avertissement) + trou rayé + teal ; `78% prêt` ; bouton « Publier » grisé + « Publication impossible — résolvez les conflits d'abord » | « Et Pawly ne vous ment pas. S'il reste un trou, il le montre. Tant qu'un conflit demeure, on ne publie pas. » | Card slide-up (spring) ; segments spring-fill ; count-up `% prêt`. Le rose est **immobile et net** — tension = donnée |
| 6 | 24–30 | **Le calme retrouvé** | Un geste comble le trou, le segment rose **spring vers le teal**, barre 100% teal, `100% prêt`, « Tout est bon — aucune violation détectée » ; « Publier » grisé→teal + 1 pulse → badge « Publié » | « Vous ajustez en deux gestes. Tout est vert : vous publiez. Et l'équipe est prévenue — e-mail et notification. » | **Le spring le plus important du film** : rose→teal ; count-up qui se pose (léger overshoot). Ne pas compresser — le soulagement doit atterrir |
| 7 | 30–36 | **Côté équipe (PWA)** | Un téléphone : carte de shift publié + bouton « Confirmer ma présence » qui passe en 3 états → « Présence confirmée » (check teal). Ligne : « Équipe prévenue par e-mail et notification. » | « Chacun confirme sa présence d'un geste. Plus d'allers-retours. » | **Fix fidélité** : bouton 3 états par seuils de frame (PAS un slider à glisser). 1 device |
| 8 | 36–42 | **La promesse** | Linen calme. Logo Pawly **plat** (jamais de dégradé). Lignes display : « Le planning intelligent. Pour votre clinique. » + « …pour vous concentrer sur l'essentiel : le soin animal. » + caption `~3 h chaque dimanche → un clic` | « Le planning intelligent. Pour votre clinique. Pour vous concentrer sur l'essentiel : le soin animal. » | 2 lignes spring-stagger (50ms) ; le stat garde le `~` (estimation du gérant, pas un benchmark). Logo figé |
| 9 | 42–52 | **L'invitation (CTA unique)** | UNE CTA : « Devenez clinique partenaire — pilote gratuit 3 mois ». Rareté honnête : 5 silhouettes, 2 cochées teal, 3 qui pulsent. « On co-construit Pawly avec 3 à 5 cliniques d'Île-de-France. » « Alex — fondateur ». Bouton « Réserver 20 min ». 1 accent **orange** souligne « ensemble » | « Pawly existe déjà ; je veux le finir avec vous, pas pour vous. 3 à 5 cliniques d'Île-de-France, gratuit 3 mois. Ce n'est pas une vente — c'est une invitation. Parlons-en 20 minutes, sans engagement. » | CTA spring-reveal ; 3 silhouettes vides pulsent ; soulignage orange ease-out ; bouton scale-in en dernier. Puis **tout se fige** — le calme tient jusqu'à la fin |

## 🎯 Le différenciateur = la colonne vertébrale (payé 3 fois)

Pas un beat isolé : **le wedge ouvre la preuve et est confirmé 3 fois.**
1. **Scène 2 (preuve)** — le mardi de Léa se verrouille **en premier**, on voit l'algo greedy **contourner** le jour d'école avant tout argument.
2. **Scène 3 (donnée)** — le badge `+7h école` = vrai `SCHOOL_DAY_MINUTES = 420 = 7h` (donnée produit réelle, pas un chiffre marketing).
3. **Scène 4 (plausibilité)** — le flip réel « Déclaration manquante » → « Jours d'école fournis » explique **pourquoi** Pawly connaît les jours d'école : déclarés une fois.

C'est la seule chose qu'aucun concurrent dossiers/factu/stock ne fait — et exactement le casse-tête alternance que les cliniques IDF bricolent à la main dans Excel.

## ✂️ Ce qui change vs v1 (et ce qu'on coupe)

- **74s/10 scènes → 52s/9 beats** — chaque seconde gagne sa place vers la conversion.
- **Wedge déplacé de la scène 4 à l'ouverture** (greffe #1 de tous les juges) → le différenciateur atterrit à la seconde 6, plus à la 16.
- **Coupé** : le cold-open horloge de 4s (→ compteur de coût 1,4s) · l'Excel qui tremble + la collision (→ tension = un segment rose net) · le vacuum (déco pure) · les cartes pastel + toute couleur hors-palette · les fonds multi-gradient (→ **une** respiration teal) · les montages de stats redondants (→ **un** count-up) · la 2e CTA / liste de features (→ **une** invitation).
- **Fix fidélité** : la confirmation est un **bouton 3 états**, pas un slider à glisser.

## ⚙️ Réutilisable du projet existant
`promo-video/src/components/` : `StaffGrid`, `GenerationButton`, `FauxCursor`, `Caption` — à reprendre. Composants à créer : `BreathingGradient` (fond partagé), `CountUp` (Geist-Mono), `ConstraintBeams` (SVG), `HealthBar`, `PhoneConfirm`. Tokens à corriger dans `theme.ts` : ajouter Geist-Mono, Electric Indigo `#4F46E5`, Vital Orange `#F97316`, border exact `#E8E5E0`.

## 🔓 À ta main avant prod
- L'adresse de contact réelle (placeholder `alex@pawly.fr`).
- Le compteur `03:47:12` : ordre de grandeur crédible — à ajuster si tu veux une autre estimation.
