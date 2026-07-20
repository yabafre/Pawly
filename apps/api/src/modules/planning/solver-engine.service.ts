/**
 * or-tools-wasm CP-SAT adapter — Story 12-1 (KON-129).
 *
 * The ONLY file in the codebase that touches or-tools-wasm. Translates the
 * neutral IR (solver-model.ts) into a CpModel, solves with pinned determinism
 * parameters (numSearchWorkers=1, fixed randomSeed, maxDeterministicTime budget
 * — never a wall-clock limit, which would break run-to-run reproducibility),
 * and returns the chosen variable names. Swap plan: if or-tools-wasm proves
 * unfit, this file is replaced by an HTTP client to a Python CP-SAT
 * microservice with the same SolveResult contract — nothing else changes.
 *
 * The package is ESM-only (`"type": "module"`) while the Nest build is CJS, so
 * it is loaded through NODE's native require via createRequire — Node >= 22.12
 * loads synchronous ESM through require(), and bypassing the module wrapper of
 * the test runner avoids Jest's ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG on
 * dynamic import(). API surface verified against the package's own
 * build/javascript/lib/cp-sat.d.ts at v0.9.1 (Task 2 smoke canary:
 * apps/api/scripts/solver-smoke.ts).
 */
import { Injectable, Logger } from '@nestjs/common';
import { createRequire } from 'node:module';
import type { BoolVar, IntVar } from 'or-tools-wasm/cp-sat';
import type { SolverModel } from './solver-model';

export type SolveStatus =
  | 'OPTIMAL'
  | 'FEASIBLE'
  | 'INFEASIBLE'
  | 'UNKNOWN'
  | 'ENGINE_UNAVAILABLE';

export interface SolveResult {
  status: SolveStatus;
  chosenVarNames: Set<string>;
}

export interface SolveOptions {
  /** CP-SAT deterministic-time budget (deterministic seconds, not wall-clock). */
  deterministicTimeBudget: number;
  /** Warm start: var names set to 1 in the hint (the greedy+repair solution). */
  hint?: Set<string>;
}

type CpSatModule = typeof import('or-tools-wasm/cp-sat');

const RANDOM_SEED = 129; // pinned — determinism invariant #3

let cpSatModule: CpSatModule | null = null;
function loadCpSat(): CpSatModule {
  if (!cpSatModule) {
    // process.getBuiltinModule bypasses any module-system wrapper (Jest shims
    // node:module's createRequire; the process-level API cannot be intercepted),
    // so this require is NODE's real loader in every environment. Fallback to
    // the imported createRequire for runtimes without getBuiltinModule.
    const nodeModule = (
      process as NodeJS.Process & {
        getBuiltinModule?: (id: string) => {
          createRequire: typeof createRequire;
        };
      }
    ).getBuiltinModule?.('node:module');
    const nativeRequire = (nodeModule?.createRequire ?? createRequire)(
      __filename,
    );
    cpSatModule = nativeRequire('or-tools-wasm/cp-sat') as CpSatModule;
  }
  return cpSatModule;
}

@Injectable()
export class SolverEngineService {
  private readonly logger = new Logger(SolverEngineService.name);

  async solve(model: SolverModel, options: SolveOptions): Promise<SolveResult> {
    try {
      return await this.solveUnsafe(model, options);
    } catch (error) {
      // Story 13-6 (KON-137, T11) — a throw here means the ENGINE ITSELF failed
      // (e.g. or-tools-wasm cannot load on Node < 22.12), not that the solver ran
      // and found nothing. Surface a distinct status so `solver_status` can tell an
      // ops team "the engine is down" (alertable) from "the model was infeasible".
      this.logger.warn(`CP-SAT solve threw: ${String(error)}`);
      return { status: 'ENGINE_UNAVAILABLE', chosenVarNames: new Set() };
    }
  }

  private async solveUnsafe(
    model: SolverModel,
    options: SolveOptions,
  ): Promise<SolveResult> {
    const { CpModel, CpSolver, LinearExpr } = loadCpSat();

    const cp = new CpModel();
    const assignmentVars = new Map<string, BoolVar>();
    for (const v of model.vars) {
      assignmentVars.set(v.name, cp.newBoolVar(v.name));
    }
    // Spread target IntVars, keyed by their constraint tag (objective references them by name).
    const spreadVars = new Map<string, IntVar>();
    const varByName = (name: string): IntVar =>
      assignmentVars.get(name) ?? spreadVars.get(name)!;

    // `day:{emp}:{date}` pseudo-vars referenced by `consecutive:` constraints —
    // dayVar is an OR over that (employee, date)'s assignment vars, encoded as
    // one implication per var (x -> dayVar). Materialized lazily, memoized.
    const dayVars = new Map<
      string,
      ReturnType<InstanceType<typeof CpModel>['newBoolVar']>
    >();
    const ensureDayVar = (name: string) => {
      let dayVar = dayVars.get(name);
      if (dayVar) return dayVar;
      dayVar = cp.newBoolVar(name);
      dayVars.set(name, dayVar);
      const [, employeeId, date] = name.split(':');
      for (const v of model.vars) {
        if (v.employeeId !== employeeId) continue;
        if (!v.slotId.startsWith(`${date}|`)) continue;
        cp.addImplication(assignmentVars.get(v.name)!, dayVar);
      }
      return dayVar;
    };

    for (const c of model.constraints) {
      if (c.kind === 'linearLe') {
        const vars = c.terms.map((t) =>
          t.varName.startsWith('day:')
            ? ensureDayVar(t.varName)
            : assignmentVars.get(t.varName)!,
        );
        cp.addLinearConstraint(
          LinearExpr.weightedSum(
            vars,
            c.terms.map((t) => t.coeff),
          ),
          0,
          c.bound,
        );
      } else {
        // spread: target (named by tag) == max(counts) - min(counts).
        const upper = Math.max(
          ...c.perEmployee.map((p) => p.terms.length + p.fixed),
        );
        const counts = c.perEmployee.map((p, idx) => {
          const count = cp.newIntVar(0, upper, `${c.tag}:cnt:${idx}`);
          cp.addEquality(
            count,
            LinearExpr.weightedSum(
              [
                ...p.terms.map((t) => assignmentVars.get(t.varName)!),
                cp.newConstant(1),
              ],
              [...p.terms.map((t) => t.coeff), p.fixed],
            ),
          );
          return count;
        });
        const maxVar = cp.newIntVar(0, upper, `${c.tag}:max`);
        const minVar = cp.newIntVar(0, upper, `${c.tag}:min`);
        cp.addMaxEquality(maxVar, counts);
        cp.addMinEquality(minVar, counts);
        const spreadVar = cp.newIntVar(0, upper, c.tag);
        cp.addEquality(
          spreadVar,
          LinearExpr.weightedSum([maxVar, minVar], [1, -1]),
        );
        spreadVars.set(c.tag, spreadVar);
      }
    }

    cp.maximize(
      LinearExpr.weightedSum(
        model.objective.map((t) => varByName(t.varName)),
        model.objective.map((t) => t.weight),
      ),
    );

    if (options.hint) {
      for (const v of model.vars) {
        cp.addHint(
          assignmentVars.get(v.name)!,
          options.hint.has(v.name) ? 1 : 0,
        );
      }
    }

    const solver = new CpSolver();
    // numWorkers is the CURRENT field (0 = auto, and only then is the deprecated
    // numSearchWorkers alias read) — set BOTH so determinism survives either
    // resolution order across package versions. Single worker is load-bearing:
    // auto (multi-worker) search is non-reproducible (invariant #3).
    solver.parameters.numWorkers = 1;
    solver.parameters.numSearchWorkers = 1;
    solver.parameters.randomSeed = RANDOM_SEED;
    solver.parameters.maxDeterministicTime = options.deterministicTimeBudget;

    const rawStatus = await solver.solve(cp);
    const statusName = solver.statusName(rawStatus);

    if (statusName !== 'OPTIMAL' && statusName !== 'FEASIBLE') {
      return {
        status: statusName === 'INFEASIBLE' ? 'INFEASIBLE' : 'UNKNOWN',
        chosenVarNames: new Set(),
      };
    }

    const chosen = new Set<string>();
    for (const v of model.vars) {
      if (solver.value(assignmentVars.get(v.name)!) === 1) chosen.add(v.name);
    }
    return {
      status: statusName === 'OPTIMAL' ? 'OPTIMAL' : 'FEASIBLE',
      chosenVarNames: chosen,
    };
  }
}
