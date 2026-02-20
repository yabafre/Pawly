"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  createTemplateSchema,
  updateTemplateSchema,
  duplicateTemplateSchema,
  templateIdSchema,
  listTemplatesSchema,
} from "@pawly/validators";

export const listTemplatesAction = createServerAction()
  .input(listTemplatesSchema)
  .handler(async ({ input }) => {
    return trpc.planning.listTemplates.query(input);
  });

export const getTemplateByIdAction = createServerAction()
  .input(templateIdSchema)
  .handler(async ({ input }) => {
    return trpc.planning.getTemplateById.query(input);
  });

export const createTemplateAction = createServerAction()
  .input(createTemplateSchema)
  .handler(async ({ input }) => {
    return trpc.planning.createTemplate.mutate(input);
  });

export const updateTemplateAction = createServerAction()
  .input(updateTemplateSchema)
  .handler(async ({ input }) => {
    return trpc.planning.updateTemplate.mutate(input);
  });

export const deleteTemplateAction = createServerAction()
  .input(templateIdSchema)
  .handler(async ({ input }) => {
    return trpc.planning.deleteTemplate.mutate(input);
  });

export const duplicateTemplateAction = createServerAction()
  .input(duplicateTemplateSchema)
  .handler(async ({ input }) => {
    return trpc.planning.duplicateTemplate.mutate(input);
  });
