"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  listApprenticeDeclarationsSchema,
  upsertNoSchoolSchema,
  deleteDeclarationSchema,
  getDeclarationStatusSchema,
} from "@pawly/validators";

export const listApprenticeDeclarationsAction = createServerAction()
  .input(listApprenticeDeclarationsSchema)
  .handler(async ({ input }) => {
    return trpc.planning.listApprenticeDeclarations.query(input);
  });

export const upsertNoSchoolAction = createServerAction()
  .input(upsertNoSchoolSchema)
  .handler(async ({ input }) => {
    return trpc.planning.upsertNoSchool.mutate(input);
  });

export const deleteApprenticeDeclarationAction = createServerAction()
  .input(deleteDeclarationSchema)
  .handler(async ({ input }) => {
    return trpc.planning.deleteApprenticeDeclaration.mutate(input);
  });

export const getDeclarationStatusAction = createServerAction()
  .input(getDeclarationStatusSchema)
  .handler(async ({ input }) => {
    return trpc.planning.getDeclarationStatus.query(input);
  });
