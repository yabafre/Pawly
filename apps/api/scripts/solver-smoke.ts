/**
 * KON-129 smoke test — proves the or-tools-wasm CP-SAT surface the adapter
 * (solver-engine.service.ts) relies on: bool vars, weighted linear constraints,
 * weighted maximize, determinism parameters, hint API, status + value readback.
 * API surface verified against the package's own build/javascript/lib/cp-sat.d.ts
 * (v0.9.1) — import is the `or-tools-wasm/cp-sat` subpath, constraints take a
 * LinearExprLike + [lb, ub], solve() is async and returns an enum OR name string
 * (normalize via statusName()).
 * Run: pnpm --filter @pawly/api exec tsx scripts/solver-smoke.ts
 */
import { CpModel, CpSolver, LinearExpr } from 'or-tools-wasm/cp-sat';

async function main(): Promise<void> {
  // x + y + z <= 2, maximize 3x + 2y + z -> expect OPTIMAL, objective 5 (x=1, y=1, z=0)
  const model = new CpModel();
  const x = model.newBoolVar('x');
  const y = model.newBoolVar('y');
  const z = model.newBoolVar('z');
  model.addLinearConstraint(LinearExpr.weightedSum([x, y, z], [1, 1, 1]), 0, 2);
  model.maximize(LinearExpr.weightedSum([x, y, z], [3, 2, 1]));

  const solver = new CpSolver();
  solver.parameters.numWorkers = 1; // current field; deprecated alias below only read when this is 0
  solver.parameters.numSearchWorkers = 1;
  solver.parameters.randomSeed = 12;
  solver.parameters.maxDeterministicTime = 1.0;

  const status = await solver.solve(model);
  const name = solver.statusName(status);
  if (name !== 'OPTIMAL') throw new Error(`status=${name}, expected OPTIMAL`);
  const objective = solver.objectiveValue();
  if (objective !== 5) throw new Error(`objective=${objective}, expected 5`);
  if (
    !solver.booleanValue(x) ||
    !solver.booleanValue(y) ||
    solver.booleanValue(z)
  ) {
    throw new Error(
      `values x=${solver.booleanValue(x)} y=${solver.booleanValue(y)} z=${solver.booleanValue(z)}, expected 1/1/0`,
    );
  }

  // Hint round: same model shape, warm-started at the optimum — must stay OPTIMAL.
  const hinted = new CpModel();
  const hx = hinted.newBoolVar('x');
  const hy = hinted.newBoolVar('y');
  const hz = hinted.newBoolVar('z');
  hinted.addLinearConstraint(
    LinearExpr.weightedSum([hx, hy, hz], [1, 1, 1]),
    0,
    2,
  );
  hinted.maximize(LinearExpr.weightedSum([hx, hy, hz], [3, 2, 1]));
  hinted.addHint(hx, 1);
  hinted.addHint(hy, 1);
  hinted.addHint(hz, 0);
  const hintedSolver = new CpSolver();
  hintedSolver.parameters.numWorkers = 1;
  hintedSolver.parameters.numSearchWorkers = 1;
  hintedSolver.parameters.randomSeed = 12;
  hintedSolver.parameters.maxDeterministicTime = 1.0;
  const hintedName = hintedSolver.statusName(await hintedSolver.solve(hinted));
  if (hintedName !== 'OPTIMAL')
    throw new Error(`hinted status=${hintedName}, expected OPTIMAL`);

  console.log('SMOKE OK — OPTIMAL, objective 5, hint accepted');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
