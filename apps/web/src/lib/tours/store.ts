import { create } from 'zustand';
import type { TourKey } from './registry';

type TourStore = {
  activeTour: TourKey | null;
  step: number;
  isRunning: boolean;
  start: (tour: TourKey, step: number) => void;
  setStep: (step: number) => void;
  stop: () => void;
};

export const useTourStore = create<TourStore>((set) => ({
  activeTour: null,
  step: 0,
  isRunning: false,
  start: (tour, step) => set({ activeTour: tour, step, isRunning: true }),
  setStep: (step) => set({ step }),
  stop: () => set({ activeTour: null, step: 0, isRunning: false }),
}));
