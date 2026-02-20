# Algorithme de Planification Pawly - Document de Référence

## Vue d'ensemble

L'algorithme de planification est un **algorithme greedy (glouton) slot-par-slot** implémenté dans `PlanningGenerationService.generateMonthlyPlan()`. Il assigne des employés aux créneaux définis par un template hebdomadaire, en respectant des contraintes dures (bloquantes) et molles (avertissements).

```
Template Hebdo → Expansion au mois → Réordonnancement → Scoring slot par slot → Shifts en BDD
```

---

## Phase 1 : Entrées

### 1.1 Template hebdomadaire
- Défini par l'admin (Story 6-1)
- Structure : `{ days: TemplateDay[] }` où chaque `TemplateDay` contient :
  - `dayOfWeek` : 1 (lundi) à 7 (dimanche)
  - `slots: TemplateSlot[]` :
    - `shiftTypeCode` : code du type de quart (ex: `CHIR`, `ACC`, `VET`)
    - `requiredStaff` : nombre d'employés requis
    - `requiredJobTypes?` : filtre optionnel par métier (ex: `['VET']`)

### 1.2 Configuration opérationnelle de la clinique
- `workDays` : jours travaillés (ex: `['MONDAY', 'TUESDAY', ..., 'SATURDAY']`)
- `closedDays` : jours fermés spécifiques (ex: jours fériés)
- `specialDays` : jours avec horaires modifiés (startTime/endTime override)

### 1.3 Types de quarts (`ClinicShiftType`)
- `code` : identifiant unique (ex: `CHIR`)
- `startTime` / `endTime` : horaires par défaut (ex: `08:00` - `18:00`)
- **`breakMinutes`** : temps de pause en minutes (ex: `60`)
  - **Heures nettes = (endTime - startTime) - breakMinutes**
  - Ex: 08:00-18:00 avec 60 min pause = **9h nettes** (pas 10h)

### 1.4 Employés actifs
- `id`, `firstName`, `lastName`
- `jobType` : VET, ASV, APPRENTICE, etc.
- `contractHours` : heures contractuelles hebdomadaires (ex: `35`)

### 1.5 Contraintes chargées (`loadConstraints`)

| Contrainte | Source | Description |
|------------|--------|-------------|
| `unavailableMap` | `Unavailability` (Prisma) | Map `employeeId → Set<dates>` de dates indisponibles |
| `schoolDayMap` | `Unavailability` type=SCHOOL | Dates d'école des apprentis (comptent 7h/jour) |
| `hardRules` | `PlanningRule` ruleType=HARD | Règles bloquantes (empêchent l'assignation) |
| `softRules` | `PlanningRule` ruleType=SOFT | Règles d'avertissement (pénalité de score) |
| `equityMap` | `EquityCounter` | Compteurs d'équité cumulés (samedis, weekends, fériés, heures sup) |
| `quarterlyShifts` | `Shift` historique | Shifts des autres mois du trimestre (si règle ROTATION_EQUITY trimestrielle) |

---

## Phase 1b : Chargement des shifts frontaliers (Border Week Shifts)

**Méthode** : `loadBorderWeekShifts(clinicId, month)`

**Problème** : Les semaines ISO ne s'alignent pas sur les mois. Si mars commence un mercredi, la semaine ISO contient lundi-mardi de février. Sans ces shifts, le calcul hebdomadaire sous-estime les heures et peut dépasser les limites contractuelles.

**Solution** :
1. Calculer les bornes ISO de la première et dernière semaine du mois
2. Identifier les jours hors-mois dans ces semaines (ex: 23-28 février pour la semaine du 1er mars)
3. Charger les shifts existants en DB pour ces jours (`prisma.shift.findMany`)
4. Les injecter dans :
   - `allShiftsForScoring` — pour le calcul `weeklyMinutesMap` (heures hebdo)
   - `assignmentIndex` — pour les checks de chevauchement et jours consécutifs
5. **Ne PAS les persister** — seuls les `assignedShifts` (nouveaux) sont écrits en DB

```
Février (déjà généré)    Mars (en cours de génération)
... Lun 23 → Dim 1er ←── borderShifts chargés
    ─────── Semaine ISO 9 ───────
```

**Impact** : Un employé ayant déjà travaillé 35h en février (lun-ven) ne sera PAS assigné au dimanche 1er mars si sa limite hebdo est atteinte.

---

## Phase 2 : Expansion du template au mois

**Méthode** : `expandTemplateToMonth(template, month, operationalConfig, shiftTypeMap)`

Pour chaque jour du mois :
1. **Skip** si jour fermé (`closedDays`)
2. **Skip** si pas dans le template (`templateDayNumbers`)
3. Pour chaque slot du template de ce jour :
   - Récupérer les horaires du `shiftTypeMap` (via `shiftTypeCode`)
   - Si **jour spécial** : clamper les horaires dans la fenêtre spéciale
   - Créer un `SlotRequirement` : `{ date, shiftTypeCode, startTime, endTime, breakMinutes, requiredStaff, requiredJobTypes }`

**Résultat** : Liste plate de `SlotRequirement[]` pour tout le mois.

---

## Phase 3 : Réordonnancement des slots

**Méthode** : `reorderSlotsNonWorkDaysFirst(slots, workDaySet)`

**Principe** : Au sein de chaque semaine ISO, les slots des jours **non travaillés** sont traités AVANT les jours travaillés.

**Pourquoi** : Sans cela, l'algorithme traite lundi→vendredi d'abord, épuisant le budget horaire des employés. Quand il arrive au samedi, personne n'a de budget restant → tous les slots samedi restent vides.

```
Avant : Lun → Mar → Mer → Jeu → Ven → Sam (budget épuisé)
Après : Sam → Lun → Mar → Mer → Jeu → Ven (samedi servi en premier)
```

**Dynamique** : Utilise la config `workDays` de la clinique (PAS de samedi/dimanche en dur). Si la clinique travaille le samedi mais pas le mercredi, le mercredi sera traité en premier.

**Entre les semaines** : L'ordre chronologique est maintenu. Semaine 1 complète, puis Semaine 2, etc.

---

## Phase 4 : Scoring et assignation (coeur de l'algorithme)

**Méthode** : `scoreAndAssign(slot, employees, constraints, ...)`

Pour chaque `SlotRequirement`, l'algorithme :

### 4.1 Pré-calculs

| Calcul | Description |
|--------|-------------|
| `slotMinutes` | Durée nette du créneau : `(endTime - startTime) - breakMinutes` |
| `weekBounds` | Bornes ISO de la semaine du slot |
| `weeklyMinutesMap` | Minutes travaillées cette semaine pour chaque employé (shifts + jours d'école 7h). **Inclut les border shifts** des mois adjacents (voir Phase 0). |

### 4.2 Filtrage d'éligibilité (éliminatoire)

Chaque employé est testé séquentiellement. **Un seul échec = éliminé**.

| # | Filtre | Description | Priorité |
|---|--------|-------------|----------|
| 1 | **Indisponibilité** | Employé indisponible ce jour-là (vacances, maladie, école, autre) | Absolu |
| 2 | **Chevauchement horaire** | Employé déjà assigné à un créneau qui chevauche | Absolu |
| 3 | **Job type requis** | Si le slot exige un type de métier (ex: VET), seuls les VET passent | Absolu |
| 4 | **HARD ROTATION_EQUITY** | Règle dure de rotation (ex: max 2 samedis/mois). Bloque si dépassé. Supporte `applicableJobTypes` pour cibler certains métiers. | Règle |
| 5 | **HARD CONTRACT_COMPLIANCE** | Limite horaire dure. Calcul : `weekMin + slotMinutes > contractHours * 60 * (1 + overtimeTolerance%)` | Règle |

**Note importante sur CONTRACT_COMPLIANCE** :
- La limite hebdomadaire effective = `min(emp.contractHours, rule.maxWeeklyHours)`
- Un employé à 25h de contrat avec une règle à 35h/semaine est limité à 25h
- Un employé à 35h de contrat avec une règle à 35h/semaine est limité à 35h
- L'`overtimeThresholdPercent` (ex: 10%) autorise un léger dépassement : 35h * 1.10 = 38.5h

### 4.3 Vérification des règles dures au niveau du slot

Avant le scoring, on vérifie les règles HARD liées au slot lui-même :

| Règle | Description | Effet |
|-------|-------------|-------|
| `STAFFING_MINIMUM` | Nombre minimum requis (par job type optionnel) | Si pas assez d'éligibles → violation bloquante, slot = trou |
| `SKILL_REQUIREMENT` | Types de métiers requis pour ce shift type | Si un type manque parmi les éligibles → violation bloquante |

Si une violation HARD au slot est détectée → **aucun employé n'est assigné** et le slot devient un trou.

### 4.4 Système de scoring (classement des éligibles)

Chaque employé éligible reçoit un **score de base de 100**, puis des bonus/malus :

| Facteur | Bonus/Malus | Condition | Poids |
|---------|-------------|-----------|-------|
| **Équité weekend** | +10 | Employé en dessous de la moyenne de weekends | Faible |
| **Équité samedi** | +10 | Employé en dessous de la moyenne de samedis | Faible |
| **Équité fériés** | +5 / -5 | En dessous / au-dessus de la moyenne de fériés | Faible |
| **Équité heures sup** | -5/h excédentaire | Au-dessus de la moyenne d'overtime | Modéré |
| **Nouvel employé** (pas d'equity) | +20 | Pas encore de compteur d'équité | Modéré |
| **Contrat mensuel** | +10 | Si l'assignation reste dans le budget mensuel | Modéré |
| **Job type match** | +15 | Le job type de l'employé correspond au slot | Modéré |
| **Répartition mensuelle** | -25 * excès / +15 * déficit | Écart par rapport à la moyenne de shifts | Fort |
| **Heures hebdo sous limite** | +50 * ratio restant | Plus il reste de budget hebdo, plus le bonus est fort | **Dominant** |
| **Heures hebdo au-dessus** | -40 * heures excédentaires | Pénalité forte pour dépassement | **Dominant** |
| **Fill-to-contract** | +30 si <50% utilisé, +15 si <80% | Préférence massive pour les employés loin de leur limite | **Dominant** |
| **Jours consécutifs** | -8 par jour consécutif | Évite 6+ jours de travail de suite | Modéré |
| **SOFT ROTATION_EQUITY** | -25 * priorityWeight | Si max par période atteint | Modéré |
| **SOFT CONTRACT_COMPLIANCE** | -15/h * priorityWeight (hebdo), -10/h (mensuel) | Dépassement soft | Modéré |

### 4.5 Hiérarchie effective des facteurs de scoring

```
                    ┌─────────────────────────────────────┐
                    │  FACTEURS DOMINANTS (total ~130pts)  │
                    │                                     │
                    │  1. Heures hebdo restantes (+50)     │
                    │  2. Fill-to-contract (+30)           │
                    │  3. Pénalité dépassement hebdo (-40) │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  FACTEURS FORTS (~25pts chacun)      │
                    │                                     │
                    │  4. Répartition mensuelle shifts     │
                    │  5. Soft ROTATION_EQUITY penalty     │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  FACTEURS MODÉRÉS (~10-20pts)        │
                    │                                     │
                    │  6. Job type match (+15)             │
                    │  7. Contrat mensuel (+10)            │
                    │  8. Soft CONTRACT_COMPLIANCE penalty │
                    │  9. Jours consécutifs (-8/jour)      │
                    │  10. Nouvel employé (+20)            │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  FACTEURS FINS (~5-10pts)            │
                    │                                     │
                    │  11. Équité weekend/samedi (+10)     │
                    │  12. Équité fériés (+/-5)            │
                    │  13. Équité overtime (-5/h)          │
                    └─────────────────────────────────────┘
```

### 4.6 Résolution des égalités

Quand deux employés ont le même score → **tiebreaker aléatoire** (`Math.random() - 0.5`).

Sans cela, le même employé gagnait systématiquement les égalités (tri stable + ordre DB constant), créant un biais.

### 4.7 Assignation

Les `slot.requiredStaff` meilleurs scores sont assignés. Pour chaque assigné :
1. Vérification des violations SOFT (enregistrées comme warnings)
2. Ajout au tableau `assigned`
3. Mise à jour de `employeeMinutes` avec les minutes nettes (heures brutes - pause)

Si `toAssign.length < slot.requiredStaff` → **trou (hole)** avec raison.

---

## Phase 5 : Persistance

1. **Transaction atomique** (`$transaction`) :
   - Suppression de tous les shifts `GENERATED` du mois
   - Création batch des nouveaux shifts (`createManyAndReturn`)
2. Retour du `GenerationResult` avec stats, trous et violations

---

## Calcul des heures — Résumé

| Contexte | Formule |
|----------|---------|
| Minutes nettes d'un créneau | `(endTime - startTime) - breakMinutes` |
| Minutes hebdo d'un employé | `Σ (shifts de la semaine nets) + Σ (jours d'école × 420min)` |
| Limite hebdo effective | `min(emp.contractHours, rule.maxWeeklyHours) × 60` |
| Tolérance overtime | `limite × (1 + overtimeThresholdPercent / 100)` |
| Limite mensuelle | `emp.contractHours × 60 × 4.33` |

**Jours d'école** : Les apprentis en école comptent 7h (420 min) par jour d'école vers leur budget hebdomadaire. Un apprenti à 35h avec 2 jours d'école (14h) n'a que 21h de budget pour les shifts.

---

## Catégories de règles

### HARD (bloquantes — empêchent l'assignation)

| Catégorie | Config | Effet |
|-----------|--------|-------|
| `CONTRACT_COMPLIANCE` | `maxWeeklyHours`, `maxMonthlyHours`, `overtimeThresholdPercent` | Élimine les employés dépassant les limites |
| `STAFFING_MINIMUM` | `shiftTypeCode`, `minStaff`, `jobTypes?` | Si pas assez d'éligibles → slot entier = trou |
| `SKILL_REQUIREMENT` | `shiftTypeCode`, `requiredJobTypes` | Si un job type manque → slot = trou |
| `ROTATION_EQUITY` | `targetDay`, `maxPerPeriod`, `trackingPeriod`, `applicableJobTypes?` | Bloque si max dépassé (mensuel ou trimestriel). Si `applicableJobTypes` est défini, ne s'applique qu'aux job types listés. |

### SOFT (avertissements — pénalité de score)

| Catégorie | Config | Effet |
|-----------|--------|-------|
| `CONTRACT_COMPLIANCE` | `maxWeeklyHours`, `maxMonthlyHours` | Pénalité de score proportionnelle au dépassement |
| `STAFFING_MINIMUM` | `shiftTypeCode`, `minStaff`, `jobTypes?` | Warning si sous le minimum recommandé |
| `SKILL_REQUIREMENT` | `shiftTypeCode`, `requiredJobTypes` | Warning si job type manquant |
| `ROTATION_EQUITY` | `targetDay`, `maxPerPeriod`, `trackingPeriod`, `applicableJobTypes?` | Pénalité de score (-25 × poids priorité). Respecte `applicableJobTypes`. |

### applicableJobTypes (ROTATION_EQUITY)

Champ optionnel `applicableJobTypes: string[]` sur la config des règles `ROTATION_EQUITY`.

**Exemple** : La règle "ASV équité" (max 2 samedis/mois) avec `applicableJobTypes: ["ASV"]` ne bloque que les ASV. Les VET peuvent travailler autant de samedis que nécessaire.

**Sans ce champ** : La règle s'applique à TOUS les employés (comportement par défaut, rétrocompatible).

**Appliqué dans** :
- `violatesHardRotationEquity` — skip si l'employé n'est pas dans la liste
- `checkRotationEquity` — idem pour les violations soft
- Scoring dans `scoreAndAssign` — idem pour la pénalité de score

---

## Paramètres de config et leur impact

| Paramètre | Où le configurer | Impact |
|-----------|-----------------|--------|
| `contractHours` (employé) | Fiche employé | Limite hebdo de base |
| `breakMinutes` (shift type) | Settings > Types de quarts | Réduit les heures nettes comptabilisées |
| `workDays` | Settings > Général | Détermine quels jours sont "non-travaillés" (traités en priorité) |
| `closedDays` | Settings > Général | Jours sautés complètement |
| `maxWeeklyHours` (règle) | Settings > Règles planning | Cap supplémentaire hebdo (min avec contractHours) |
| `maxMonthlyHours` (règle) | Settings > Règles planning | Cap mensuel absolu |
| `overtimeThresholdPercent` (règle) | Settings > Règles planning | Tolérance de dépassement (ex: 10% = 35h → 38.5h max) |
| `minStaff` (règle) | Settings > Règles planning | Minimum requis par créneau |
| `targetDays` + `maxPerPeriod` (règle) | Settings > Règles planning | Rotation équitable (ex: max 2 samedis/mois) |
| `trackingPeriod` (règle) | Settings > Règles planning | `monthly` ou `quarterly` pour la rotation |
| `priority` (règle) | Settings > Règles planning | Poids multiplicateur pour les pénalités soft (0-10) |

---

## Limites connues de l'algorithme

1. **Greedy sans backtracking** : L'algorithme ne revient jamais sur une décision. Si un mauvais choix est fait tôt, il ne peut pas être corrigé plus tard.

2. **Pas d'optimisation globale** : Ne cherche pas la solution "optimale" mathématiquement. Le scoring heuristique donne de bons résultats mais pas nécessairement les meilleurs.

3. **Ordre de traitement impacte le résultat** : Le réordonnancement (non-workdays first) atténue ce problème mais ne l'élimine pas complètement.

4. **Tiebreaker aléatoire** : Deux exécutions successives peuvent donner des résultats légèrement différents quand les scores sont proches.

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `apps/api/src/modules/planning/planning-generation.service.ts` | Algorithme complet |
| `apps/api/src/modules/planning/planning.service.ts` | Gestion des règles + validation |
| `apps/api/src/modules/planning/planning-template.service.ts` | CRUD templates |
| `apps/api/src/modules/planning/equity-counter.service.ts` | Compteurs d'équité |
| `apps/api/src/modules/clinic/clinic.service.ts` | Config opérationnelle + shift types |
| `packages/validators/src/planning/planning-generation.schema.ts` | Schémas Zod |
| `apps/api/prisma/schema/ShiftType.prisma` | Modèle Prisma (breakMinutes) |
| `apps/api/prisma/schema/Planning.prisma` | Modèle Shift + PlanningRule |
