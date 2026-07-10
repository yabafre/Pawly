'use server';
import { createServerAction } from 'zsa';
import { trpc } from '@/lib/trpc/client';
import { saveTourProgressSchema, completeTourSchema } from '@pawly/validators';

export const getTourStateAction = createServerAction().handler(async () => {
  return trpc.tour.getState.query();
});

export const saveTourProgressAction = createServerAction()
  .input(saveTourProgressSchema)
  .handler(async ({ input }) => {
    return trpc.tour.saveProgress.mutate(input);
  });

export const completeTourAction = createServerAction()
  .input(completeTourSchema)
  .handler(async ({ input }) => {
    return trpc.tour.complete.mutate(input);
  });
