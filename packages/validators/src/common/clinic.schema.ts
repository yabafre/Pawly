import { z } from "@pawly/zod";

export const clinicIdSchema = z.string().uuid();
