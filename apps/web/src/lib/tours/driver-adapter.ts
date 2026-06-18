'use client';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './pawly-tour.css';

let instance: Driver | null = null;

export type StepHandlers = {
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
};

export function highlightStep(params: {
  element: string;
  title: string;
  description: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  isFirst: boolean;
  isLast: boolean;
  handlers: StepHandlers;
}): void {
  const { element, title, description, side, isFirst, isLast, handlers } = params;
  if (!instance) {
    instance = driver();
  }
  // Supplying these hooks overrides driver.js' default navigation/close — the
  // TourProvider drives step transitions itself by re-calling highlightStep.
  instance.setConfig({
    // animate:false — the overlay's first-time entrance animation delays
    // driver.js wiring the popover buttons, so the very first "Next" felt laggy
    // while later steps (just moving the spotlight) responded instantly. No
    // animation makes every step respond on the first click, uniformly.
    animate: false,
    allowClose: true,
    showProgress: false,
    overlayColor: 'rgba(0,0,0,0.55)',
    popoverClass: 'pawly-tour',
    onNextClick: handlers.onNext,
    onPrevClick: handlers.onPrev,
    onCloseClick: handlers.onClose,
    onDestroyStarted: handlers.onClose,
  });
  instance.highlight({
    element,
    popover: {
      title,
      description,
      side: side ?? 'bottom',
      showButtons: isFirst ? ['next', 'close'] : ['next', 'previous', 'close'],
    },
  });
}

export function destroyTour(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
