"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeIdSchema,
  listEmployeesSchema,
} from "@pawly/validators";

export const listEmployeesAction = createServerAction()
  .input(listEmployeesSchema)
  .handler(async ({ input }) => {
    return trpc.employee.list.query(input ?? undefined);
  });

export const getEmployeeAction = createServerAction()
  .input(employeeIdSchema)
  .handler(async ({ input }) => {
    return trpc.employee.getById.query(input);
  });

export const createEmployeeAction = createServerAction()
  .input(createEmployeeSchema)
  .handler(async ({ input }) => {
    return trpc.employee.create.mutate(input);
  });

export const updateEmployeeAction = createServerAction()
  .input(updateEmployeeSchema)
  .handler(async ({ input }) => {
    return trpc.employee.update.mutate(input);
  });

export const toggleEmployeeActiveAction = createServerAction()
  .input(employeeIdSchema)
  .handler(async ({ input }) => {
    return trpc.employee.toggleActive.mutate(input);
  });
