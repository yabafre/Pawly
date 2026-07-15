# Triage Decision

- **Issue**: Findings de l'audit multi-agents du moteur de planning (2026-07-14, post-Epic 12)
- **Reporter**: audit commandité par Alex — 6 agents à périmètres exclusifs (cpsat, greedy, equity, labor-law, robust, tests)
- **Evidence**: rapport https://claude.ai/code/artifact/287153fd-f6f9-4bc7-9cdd-07fea30fa225 · mémoire `planning-algo-audit-2026-07-14` · findings C1 et E2 re-vérifiés ligne à ligne dans le code
- **Scope check**: out-of-scope de tout sprint actif — `state.yaml` : `current_phase: sprint`, `active_epic: 11`, mais toutes les stories des epics 11 et 12 sont `done` (aucun sprint ouvert). Route adaptée pour un lot d'audit post-sprint, sur le précédent de l'audit 2026-07-08 → Epic 11 : les HIGH alimentent un **nouvel epic** via `aped-epics` au lieu du DEFER mécanique de la matrice.
- **Classification**: lot mixte — 8 BUG (HIGH), 4 FEATURE (MEDIUM, candidates au même epic), 5 groupes DEFER, 0 REGRESSION, 0 QUESTION, 0 DUPLICATE

## HIGH — BUG → route `aped-epics` (nouvel epic candidat : « Planning Integrity & Solver Fidelity »)

| # | Finding | Preuve (spec vs code) |
|---|---------|----------------------|
| T1 | `moveShift` persiste sans garde statutaire ni rule-engine côté serveur (check client-only via `preValidateMove`) | Invariant 11-3 « limites statutaires non contournables » vs `planning-generation.service.ts:2320-2455` (zéro appel, re-vérifié) |
| T2 | TOCTOU : écritures manuelles sans verrou advisory pendant qu'une génération calcule hors transaction → double-booking persistable | Invariant 11-2 anti-duplicate / 11-5 concurrence vs `:747` (verrou génération seule) et `:2405`/`:2551` |
| T3 | Chevauchement cross-minuit invisible du modèle CP-SAT et du replay — seul cas où un plan invalide peut être **servi** | `timesOverlap:3565-3578` sans wrap ; `solver-model.ts:147,155` mutex same-date only |
| T4 | Fenêtres de validation incohérentes : move/publish = mois strict, génération = semaine ISO border (référence correcte : `createManualShift` ±8 j réels) ; `clampGapLen` crédite du repos fantôme | 11-3 : le filet statutaire doit attraper ces violations ; `:2871-2877`, `planning.service.ts:178-182`, `french-labor-law.ts:200-204` |
| T5 | Cap mensuel du solveur sans baseline survivants (`fixedMonthlyMinutes` absent de `SolverInput`) → fallback greedy systématique pour les cliniques concernées | Asymétrie avec le cap hebdo corrigé (commentaire de régression `:4227-4239`) ; `solver-model.ts:50-65, :262-272` |
| T6 | Plan cpsat servi avec les tableaux `hardViolations`/`softViolations` du plan **greedy** | Transparence 12-2 vs `:639-640`, `:4521-4526`, `:3544-3550` |
| T7 | Porte d'acceptation juge sur `shiftCount` que le solveur n'optimise pas + `fixed: 0` (survivants à poids zéro dans le spread) | Au-delà de la linéarisation documentée 12-1 ; `solver-model.ts:352-368` vs `local-repair.ts:242-246` (re-vérifié) |
| T8 | Compteurs d'équité persistés en fuseau **local** (`getDay()`, bornes locales) vs moteur UTC — tient uniquement grâce à Europe/Paris ; logique dupliquée Nest/Trigger | `equity-counter.service.ts:157-158,226` · `trigger/tasks/equity-recalc.ts` ; le test unitaire masque le bug (dates locales) |

Chaque story T1-T8 embarque ses tests manquants identifiés par audit-tests (rollback de chaîne, motifs de rejet replay, bras équité de la porte, cpsat × survivants, catch de dégradation).

## MEDIUM — FEATURE, candidates au même epic (décision à l'aped-epics)

| # | Finding | Note |
|---|---------|------|
| T9 | Repos quotidien 11h (L.3131-1) en 5ᵉ limite statutaire | **Descopé explicitement par la story 11-3** (« Do NOT add the 11h daily-rest limit as a separate check ») — donc FEATURE, pas bug. L'audit relève à raison que le proxy amplitude ne couvre pas l'inter-journalier |
| T10 | Plancher légal 48h/semaine + pause 20 min obligatoire au-delà de 6h | Code du travail sans ambiguïté (L.3121-20, L.3121-16) — codable sans juriste, contrairement au volet IDCC déféré |
| T11 | Observabilité : attributs `requested_engine`/`served_engine`/`solver_status` sur les métriques + `stats.solverOutcome` pour l'UI | Remède trivial, fort levier — préalable au monitoring de la dégradation Node <22.12 |
| T12 | Harnais property-based (fast-check) : « aucun plan servi ne viole une règle HARD », « improve-never-degrade », déterminisme + un test d'intégration routeur→vrai solveur→replay→transaction | Les invariants subsument plusieurs trous unitaires |

## DEFER — routés vers `.aped/.out-of-scope/` (2026-07-16)

| Record | Contenu | Reconsider when |
|--------|---------|-----------------|
| `mineurs-droit-travail.md` | Régime <18 ans absent (pas de champ âge) | Décision produit / premier apprenti mineur |
| `perimetre-idcc-1875.md` | Nuit, dimanche, fériés, temps partiel, moyenne 44h/12 sem | Consultation juriste IDCC 1875 |
| `equite-horizon-et-biais.md` | Horizon 12 mois vs mois courant, biais tie-break/nouvel arrivant | Après vague cpsat / retour client équité |
| `solveur-hardening-instance.md` | Offload worker_thread, plafond d'instance, borne wall-clock | Clinique >50 employés ou latence SigNoz (nécessite T11) |
| `findings-mineurs-audit.md` | 8 findings mineurs (gate 120s, soft fantômes, border rotation, M-2, priority sans max, requiredJobTypes, double-crédit 35h, badge UI) | Opportunément avec les stories touchant ces fichiers |

## Décision

- **Priority**: HIGH (lot T1-T8), MEDIUM (T9-T12), DEFER (5 records)
- **Route**: `aped-epics` pour composer le nouvel epic (proposition : T1-T8 fermes + T9-T12 à arbitrer) ; `.aped/.out-of-scope/` pour le reste
- **Overrides**: T9 reclassé FEATURE (l'audit le présentait comme confusion d'implémentation ; la spec 11-3 prouve un descope délibéré)
