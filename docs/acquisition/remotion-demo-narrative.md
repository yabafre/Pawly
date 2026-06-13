# 🎬 Narratif vidéo démo Pawly — « Mardi, il est à l'école. »

> **Le planning qui le sait déjà.** Vidéo design-partner, **74 s**, VO française.
> Concept gagnant à l'**unanimité du jury** (angle *alternance-héros*). Produit avec le skill `remotion-best-practices`.
> 100% ancré sur le code réel (audit 2026-06-03) : strings verbatim `fr.json`, couleurs et composants exacts.

**Logline** — Un dimanche soir, l'enfer du planning Excel d'une clinique véto — surtout le jour d'école d'une apprentie ASV qui percute les besoins de la clinique — se dissout en un clic : Pawly absorbe automatiquement le jour d'école dans le planning généré, la barre de Santé passe au teal 100% prêt, et le fondateur invite 3 à 5 cliniques d'Île-de-France à co-construire l'outil, gratuitement, 3 mois.

**Format** — 1920×1080, 30 fps, 2220 frames. Variante verticale 1080×1920 (mobile/LinkedIn) = mêmes composants en wrapper responsive.
**Ton musical** — Sobre, fondateur-authentique, PAS triomphal SaaS. Cold open : tic-tac d'horloge seul → **coupure nette au silence** au pivot douleur→soulagement (~17s) → nappe chaude basse. Un seul chime discret au 100% teal. Sound design léger (clic Générer, tick par cellule, swoosh sur le verrou « École »).

---

## Découpage scène par scène

### Scène 1 — Cold open : Dimanche soir, le fichier de la honte · `0–4s`
- **À l'écran** : Quasi-noir chaud. Horloge digitale `21:47`, « DIMANCHE » en petites capitales. En bas, un nom de fichier se tape lettre par lettre : `planning_semaine_FINAL_v7_vraiment_final.xlsx` — le `_v7` clignote rouge une fois. Seul son : tic-tac.
- **VO** : « Dimanche. 21h47. Et je refais encore le planning à la main. »
- **Motion** : Fade-in du noir. Typewriter via `Math.floor(frame/2)`. `_v7` flash `#EF4444` ~frame 90. Palette froide, vignette lourde.
- **Remotion** : `<Sequence from={0} durationInFrames={120}>` · `<DigitalClock/>` · `<TypewriterFilename/>` · `<Audio src=ticktock.mp3 />` · `<Vignette/>`.

### Scène 2 — Le casse-tête Excel : collision École vs Clinique · `4–11s`
- **À l'écran** : Grille Excel pleine, mardis surlignés feutre jaune sale, flèches rouges contradictoires, cellule clignotante `Léa — école ??`. Un wipe diagonal SCINDE l'écran : à GAUCHE un calendrier d'école (mardis = GraduationCap), à DROITE la grille clinique qui réclame du monde le mardi. Les deux panneaux glissent et **ENTRENT EN COLLISION** sur la colonne « mardi » — shake + flash rouge.
- **VO** : « Chaque mois, le même casse-tête. Léa est en alternance. Le mardi, elle est à l'école. » / **Caption feutre** : « L'école d'un côté. La clinique de l'autre. Le mardi, les deux en même temps. »
- **Données** : Le différenciateur posé comme **douleur**. Motif feutre-jaune « alternance/mardi » planté pour la boucle finale.
- **Remotion** : `<Sequence from={120} durationInFrames={210}>` · `<FakeExcelGrid seed=42/>` (cellules en conflit pulsent en boucle sinus) · `<SplitCollision/>` (clip-path + spring translateX) · particules à l'impact.

### Scène 3 — L'aspiration : le chaos s'efface dans le silence · `11–17s`
- **À l'écran** : Tout le chaos désaturé se fige, se contracte et s'aspire vers un point central en spirale. Le tic-tac **COUPE au silence**. La palette se réchauffe vers le Warm Linen `#FAF9F7`. Un écran Pawly calme commence à se composer.
- **VO (posée)** : « Et si la semaine se construisait toute seule ? »
- **Motion** : Vacuum (chaque élément `scale→0` + rotation spirale, motion blur). Audio HARD CUT au silence sur la frame d'aspiration totale → ~0,8s de silence pur → nappe chaude qui monte.
- **Remotion** : `<Sequence from={330} durationInFrames={180}>` · `<VacuumTransition/>` · `<Audio endAt=...>` cut · overlay filtre hue/saturate interpolé.

### Scène 4 — La déclaration AVANT de générer : le geste produit réel · `17–25s`
- **À l'écran** : UI admin Pawly sur Warm Linen. Le **vrai** `ApprenticeDeclarationPanel` s'assemble : titre « Déclarations jours d'école des apprentis », ligne « Léa Martin ». Sa puce de statut bascule de « Déclaration manquante » (rose) → « Jours d'école fournis » (vert) avec coche dessinée. Puis le `GenerationPanel` : « Mois cible : juin 2026 », « Modèle de semaine », et le bouton teal « Générer le planning » (icône Sparkles).
- **VO** : « Avec Pawly, l'apprenti déclare ses jours d'école une fois. » / **Captions exactes** : « Déclaration manquante » → « Jours d'école fournis » · bandeau « Confirmez le statut des jours d'école pour chaque apprenti avant de générer le planning ».
- **Données** : Le gate produit RÉEL — la déclaration se fait AVANT la génération. Strings verbatim de `fr.json`.
- **Motion** : Reveal clip-path montant + fade. Puce rose→vert (crossfade + path-draw). Faux curseur en Bézier vers le bouton. Spring `stiffness 300 / damping 30` (valeurs réelles `motion/react`).
- **Remotion** : `<Sequence from={510} durationInFrames={240}>` · recréer `<ApprenticeDeclarationPanel/>` & `<GenerationPanel/>` en composants Remotion à props mockées figées (pas de tRPC) · `<StatusChipFlip/>` · `<FauxCursor/>`.

### Scène 5 — ⭐ LE BATTEMENT DIFFÉRENCIATEUR : le mardi de Léa verrouillé · `25–36s`
- **À l'écran** : Clic « Générer le planning » → `Loader2` + « Génération en cours... ». Une onde de calcul balaie la `StaffGrid` (employés × jours), cellules qui poppent. **ZOOM** sur la ligne de Léa (badge `APPRENTICE`) : sa cellule MARDI ne reçoit AUCUN shift — elle se **verrouille en AbsenceCell VIOLETTE** (GraduationCap, label « École »), cerclée d'un halo doré, PENDANT que tous les autres jours se garnissent autour. Son total hebdo affiche « +7h école ».
- **VO** : « Un clic. Le moteur place chaque équipe… et garde le mardi de Léa libre. Automatiquement. C'est exactement ce que les cliniques font à la main dans Excel aujourd'hui. » / **Caption** : « Génération en cours... » → cellule « École ».
- **Données** : LE différenciateur matérialisé. Comportement moteur réel : jour d'école = indispo SCHOOL (`SCHOOL_DAY_MINUTES = 420 = 7h`), jamais planifié par-dessus. Couleur **VIOLETTE** réelle (`bg-purple-50 / text-purple-700`), PAS bleu.
- **Motion** : **MOMENT CLÉ — ralenti** (time-remap ~25,5s→31s). Vague de remplissage `delay = colIndex*4 frames`. La cellule VIOLETTE « École » se verrouille EN PREMIER (contour pointillé animé + halo doré + swoosh descendant), PUIS les autres se peuplent autour → on voit littéralement l'algo contourner l'école.
- **Remotion** : `<Sequence from={750} durationInFrames={330}>` · `<Composition>` imbriquée pour le slow-mo · `<StaffGrid/>`/`<StaffGridRow/>` mockés · `<AbsenceCell type='SCHOOL'/>` (violet réel) · remplissage `spring(frame - col*4)` · `<GoldHalo/>`.

### Scène 6 — Honnêteté greedy : un trou, un conflit, le drag-and-drop · `36–44s`
- **À l'écran** : Pull-back sur la `StaffGrid` pleine — dense mais **honnêtement imparfaite** : une `HoleCell` subsiste (bordure pointillée + icône Plus), un `ConflictIndicator` orange en haut-droite d'une cellule. La `PlanningHealthBar` apparaît et se remplit : segments rose (conflit) + orange (avertissement) + pointillé (trou) + teal (sain). Une main fantôme drag un shift dans le trou ; le segment pointillé rétrécit en direct.
- **VO** : « Le moteur n'est pas magique : il respecte les règles, et laisse les trous impossibles. À vous d'ajuster en deux gestes. » / **Captions exactes** : « Santé du planning » · « 1 conflit, 1 avertissement, 1 trou, 78% prêt ».
- **Données** : Beat d'**honnêteté produit** — le moteur greedy laisse des trous ; une grille parfaitement remplie serait un mensonge qu'un gérant averti détecte. Maths HealthBar réelle.
- **Remotion** : `<Sequence from={1080} durationInFrames={240}>` · `<PlanningHealthBar/>` piloté `useCurrentFrame→spring` largeurs · `<HoleCell/>`, `<ConflictIndicator/>` · `<GhostHandDrag/>`.

### Scène 7 — 100% prêt : déverrouillage de Publier · `44–51s`
- **À l'écran** : Après l'ajustement, la HealthBar passe **entièrement teal**. Icône `CheckCircle2` ; sous-titre « Tout est bon — aucune violation détectée » ; le compteur grimpe et se pose sur « 100% prêt ». Le bouton « Publier » passe de grisé/désactivé à actif et pulse. Clic → `PublishConfirmDialog` « Publier le planning » avec « X emails envoyés », puis badge « Publié ».
- **VO** : « Repos légal, disponibilités, équité, jours d'école : tout est respecté en même temps. Planning prêt. » / **Captions exactes** : « Tout est bon — aucune violation détectée » · « 100% prêt » · « Publier » → « Publié ».
- **Données** : Sommet émotionnel ancré dans les vraies règles. Publier est **réellement bloqué** tant que `hardViolationCount > 0` (« Publication impossible — résolvez les conflits d'abord »). Notif par EMAIL.
- **Remotion** : `<Sequence from={1320} durationInFrames={210}>` · `<CountUp/>` (Math.round interpolate, overshoot léger) · `<PublishButtonUnlock/>` · `<Audio src=chime.mp3/>` (chime discret unique).

### Scène 8 — Côté équipe : PWA, notif email, confirmation 3-états · `51–59s`
- **À l'écran** : Cut sur un mockup téléphone (PWA installée, icône « Pawly » teal). Une notif glisse du haut : « Votre planning de la semaine est disponible ». Léa ouvre l'app — sa semaine, MARDI clairement en **VIOLET « École »**. Bandeau offline « Mode hors ligne — Données en cache affichées » pulse. Elle tape le **vrai** `ConfirmationSlider` BOUTON : « Confirmer ma présence » → « Confirmation en cours… » → « Confirmé » (check teal).
- **VO** : « Toute l'équipe est prévenue par email et notification. Chacun confirme sa présence en un geste, depuis son mobile — même hors-ligne. »
- **⚠️ Fidélité critique** : `ConfirmationSlider` est un **BOUTON 3-ÉTATS**, PAS un thumb à glisser. Reproduire les 3 états exacts. PAS d'animation de poignée qui glisse.
- **Remotion** : `<Sequence from={1530} durationInFrames={240}>` · `<PhoneMockup/>` (perspective CSS) · `<PushNotification/>` (spring translateY) · `<ConfirmationSlider/>` 3-états par seuils de frame · `<OfflineBanner/>`.

### Scène 9 — Bookend : avant/après & double boucle · `59–66s`
- **À l'écran** : Split-screen calme. À GAUCHE, petit et froid : « DIMANCHE 21:47 / Excel ». À DROITE, grand et chaud (Warm Linen + teal) : « DIMANCHE 18:30 / Pawly — Publié ». Ligne kinetic : « Récupérez vos dimanches soir. » Puis le payoff avec « alternance » surligné dans le **même feutre jaune** que l'intro. Bascule rapide FR⇄EN du sous-titre (prouve le bilingue instantané réel).
- **VO** : « Pawly — la planification et les RH pensées pour les cliniques qui forment des apprentis. » / **Captions** : « Récupérez vos dimanches soir. » · « Pawly — le planning qui sait déjà que, le mardi, il est à l'école. » + bascule FR⇄EN.
- **Remotion** : `<Sequence from={1770} durationInFrames={210}>` · `<BeforeAfterSplit/>` · `<KineticText/>` · `<LangToggle/>` (crossfade) · `<FeltUnderline/>` (réutilisé scène 2).

### Scène 10 — CTA design-partner : co-construire, gratuit, 3 à 5 cliniques · `66–74s`
- **À l'écran** : End card Warm Linen. Logo Pawly (teal). Ligne co-build première personne, puis **3 slots de rareté honnête** : 5 silhouettes de clinique, 2 déjà cochées teal, 3 vides qui clignotent doucement. 3 lignes CTA avec icônes : « 3 à 5 cliniques pilotes en Île-de-France » · « Gratuit pendant 3 mois de co-design » · « Vous décidez des prochaines fonctionnalités ». Contact : « Alex — fondateur · alex@pawly.fr » + curseur clignotant, et un petit lien « Réserver 20 min ».
- **VO** : « Pawly existe déjà. Mais je veux le finir AVEC vous — pas pour vous. Je cherche 3 à 5 cliniques d'Île-de-France, gratuit pendant 3 mois. Écrivez-moi, on en parle 20 minutes, sans engagement. »
- **⚠️** : rareté **honnête** (pas « offre limitée » agressive). Remplacer `alex@pawly.fr` par la vraie adresse avant diffusion.
- **Remotion** : `<Sequence from={1980} durationInFrames={240}>` · `<EndCard/>` · `<ScarcityCounter slots={5} filled={2}/>` · `<CtaLine/>` icon path-draw · `<BlinkingCursor/>`.

---

## 🎯 Le battement différenciateur (scène 5, 25–36s)

Cœur tenu du film, après que la scène 4 pose le gate produit réel (« Confirmez le statut des jours d'école… avant de générer » → « Déclaration manquante » → « Jours d'école fournis »). Au clic « Générer le planning », la StaffGrid se remplit en vague — mais la caméra tient la ligne APPRENTICE de Léa : sa cellule MARDI ne reçoit jamais de shift. Elle se verrouille EN PREMIER en **AbsenceCell VIOLETTE** (`bg-purple-50 / text-purple-700`, GraduationCap, « École »), halo doré + swoosh, PENDANT que les autres jours se peuplent autour → on **voit l'algo greedy contourner le jour d'école**. Total hebdo « +7h école » (`SCHOOL_DAY_MINUTES = 420`). Instant ralenti pour qu'on ne le rate pas. **C'est la seule chose qu'aucun concurrent dossiers/factu/stock ne fait** — et le casse-tête exact que ces cliniques IDF font à la main dans Excel aujourd'hui.

## 🧱 End card (FR)

```
Pawly — le planning qui sait déjà que, le mardi, il est à l'école.

Je veux le finir AVEC vous, pas pour vous.
· 3 à 5 cliniques pilotes en Île-de-France
· Gratuit pendant 3 mois de co-design
· Vous décidez des prochaines fonctionnalités

Alex — fondateur · alex@pawly.fr
Réserver 20 min — sans engagement.
```

---

## 🎨 Notes de production — VÉRITÉ PRODUIT (code-vérifié 2026-06-03)

**Marque** — Nom **Pawly** (pas « Pavly »). PWA « Pawly » / « Gestion intelligente des plannings vétérinaires ».
**Couleurs** — Primaire **Vet Teal `#009588`** (segment « sain » de la HealthBar, bouton Générer, check publié, theme PWA). **JAMAIS vert/bleu comme couleur de succès — c'est le teal.** Fond Warm Linen `#FAF9F7` ; card `#FCFCFC` ; foreground `#1A1A1A` ; accent Teal Wash `#E0F2F1` ; muted `#F3F1EE` ; destructive `#EF4444`. Radius `0.75rem` (rounded-xl). Police **Inter**.

**Les vrais composants à maquetter** (recréer en composants Remotion à props mockées figées — NE PAS monter les versions Next/tRPC live) : `ApprenticeDeclarationPanel`, `GenerationPanel` (Sparkles + « Générer le planning » / Loader2 + « Génération en cours... »), `StaffGrid`/`StaffGridRow` (col nom sticky, col heures hebdo « +7h école »), `HoleCell` (`border-2 border-dashed` + Plus), `AbsenceCell` (**SCHOOL = violet** `bg-purple-50/text-purple-700/GraduationCap` — **le correctif de fidélité le plus cité**), `ConflictIndicator` (badge rond orange-500), `PlanningHealthBar`, `ConfirmationSlider`, `PublishConfirmDialog` (icône Mail).

**Maths HealthBar (à répliquer exactement)** : `hardWidth/softWidth/holeWidth = floor(count/totalPositions*100)` ; `healthyWidth = 100 - others` ; `readyPercent = round(healthyShifts/totalPositions*100)`. Segments : hard=rose-500, soft=orange-400, trous=pointillé muted (repeating-linear-gradient), sain=teal primary. Bouton Publier désactivé tant que `hardViolationCount > 0` (« Publication impossible — résolvez les conflits d'abord »).

**ConfirmationSlider = BOUTON 3-ÉTATS** (signalé par les 2 jurys), pas un thumb à glisser : « Confirmer ma présence » → « Confirmation en cours… » (Loader2) → « Confirmé » (Check teal).

**Toutes les captions = verbatim de `apps/web/src/i18n/langs/fr.json`** — zéro copie inventée. Strings clés : `healthBar.title` « Santé du planning », `healthBar.healthy` « Tout est bon — aucune violation détectée », `healthBar.ready` « {percent}% prêt », `publish` « Publier », `published` « Publié » ; `apprenticeDeclarations.subtitle` « Confirmez le statut des jours d'école pour chaque apprenti avant de générer le planning », status `MISSING` « Déclaration manquante » / `SCHOOL_DAYS_PROVIDED` « Jours d'école fournis » ; `generation.generateButton` « Générer le planning » / `generating` « Génération en cours... » ; offline « Mode hors ligne — Données en cache affichées ».

**Contraintes de fond** : `SCHOOL_DAY_MINUTES = 420` (7h) — « +7h école » / « École » littéralement vrais. Moteur **GREEDY** : respecte les règles dures (repos légal, dispos, absences dont SCHOOL), optimise l'équité, intègre les jours d'école, et **laisse honnêtement des HoleCell** quand insoluble (scène 6 garde ≥1 trou + 1 conflit avant 100%). **NE JAMAIS montrer** dossiers médicaux, facturation, stock — Pawly = planning + RH/équipe uniquement. Ton fondateur-crédible, sobre, première personne ; l'app est local-only/MVP → le CTA = invitation à co-construire, pas pitch commercial léché.

## ⚙️ Structure Remotion

`<Composition id="pawly-design-partner" fps={30} width={1920} height={1080} durationInFrames={2220}>` (74s). Variante verticale 1080×1920 = mêmes composants en wrapper responsive. Timeline = 10 `<Sequence>` par scène : S1 0–120, S2 120–330, S3 330–510, S4 510–750, **S5 750–1080**, S6 1080–1320, S7 1320–1530, S8 1530–1770, S9 1770–1980, S10 1980–2220. Tout le motion via `useCurrentFrame() + interpolate()/spring()` (remplacer les springs `motion/react` par Remotion `spring` à `stiffness=300/damping=30`). Primitives réutilisables : `<FauxCursor/>` (Bézier), `<KineticText/>` (stagger par mot), `<FakeExcelGrid/>` (seedé déterministe), `<StaffGridMock/>`+`<StaffGridRowMock/>` (`spring(frame - col*4)`), `<PlanningHealthBarMock/>` (largeurs via formule réelle), `<PhoneMockup/>`, `<ScarcityCounter/>`. Slow-mo S5 = `<Composition>` imbriquée + ré-étalement des frames. Audio via `<Audio>` : tic-tac S1–S3 coupé net à l'aspiration, puis nappe chaude jusqu'à la fin + 1 chime au 100% teal. Copie/couleurs en props (FR défaut ; EN trivial).

## 🔀 Journal des greffes & corrections de fidélité

- **Gagnant (unanime, totaux 64 & 63)** : alternance-héros — colonne vertébrale conservée (collision mardi école/clinique, génération qui contourne, trous honnêtes, publish email, confirmation mobile, tagline alternance).
- **Greffé de founder-cobuild** : le gate « déclaration AVANT génération » (scène 4) + le CTA première personne « AVEC vous, pas pour vous » + rareté honnête 5 silhouettes (scène 10, remonte le ton co-build).
- **Greffé de pain-relief** : cold-open fichier Excel nommé + horloge (scène 1, durcit le hook 0–5s) + transition vacuum avec coupure tic-tac→silence (scène 3) + boucle « Récupérez vos dimanches soir » (scène 9).
- **Greffé de day-in-the-life** : split-screen avant/après + flash bascule FR⇄EN (scène 9).
- **Corrections de fidélité imposées contre le code** : (1) jour d'école = **VIOLET** (pas bleu) ; (2) ConfirmationSlider = **bouton 3-états** (pas thumb) ; (3) garder ≥1 HoleCell + 1 ConflictIndicator avant 100% (honnêteté greedy) ; (4) « Pavly »→« Pawly » ; (5) `SCHOOL_DAY_MINUTES = 420` ; (6) Vet Teal comme couleur de succès + captions verbatim `fr.json`.
- **Non greffé** : le monologue première personne complet de founder-cobuild (trop long) ; le bloc école bleu + le geste de glisse de day-in-the-life (faux selon le code) ; la phase douleur trop longue de pain-relief (compressée à ~17s).
