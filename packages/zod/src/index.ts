/**
 * @pawly/zod
 *
 * Shared Zod instance for the Pawly monorepo.
 * All packages MUST import from here to ensure a single Zod instance.
 *
 * Usage:
 *   import { z } from '@pawly/zod'
 */
export { z } from 'zod'
export type { ZodType, infer as ZodInfer } from 'zod'
