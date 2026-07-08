import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublishedChangeDialog } from '../_components/PublishedChangeDialog';
import { PlanningHealthBar } from '../_components/PlanningHealthBar';
import { usePublishedChangeGuard } from '../_hooks/usePublishedChangeGuard';

// ---------------------------------------------------------------------------
// Mocks — next-intl is globally mocked in vitest.setup.ts: (key) => key.
// AlertDialog / Badge / motion mocked locally exactly like publish.spec.tsx.
// ---------------------------------------------------------------------------

vi.mock('motion/react', () => ({
  motion: {
    section: ({ children, animate, initial, style, ...props }: Record<string, unknown>) => (
      <section style={{ ...(style as object), ...(animate as object) }} {...props}>
        {children as React.ReactNode}
      </section>
    ),
    div: ({ children, animate, initial, exit, style, ...props }: Record<string, unknown>) => (
      <div style={{ ...(style as object), ...(animate as object) }} {...props}>
        {children as React.ReactNode}
      </div>
    ),
  },
  m: {
    section: ({ children, animate, initial, style, ...props }: Record<string, unknown>) => (
      <section style={{ ...(style as object), ...(animate as object) }} {...props}>
        {children as React.ReactNode}
      </section>
    ),
    div: ({ children, animate, initial, exit, style, ...props }: Record<string, unknown>) => (
      <div style={{ ...(style as object), ...(animate as object) }} {...props}>
        {children as React.ReactNode}
      </div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  LazyMotion: ({ children }: { children: React.ReactNode }) => children,
  domAnimation: {},
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="alert-dialog">
        {/* Stand-in for Radix ESC / outside-click dismissal, which fires
            onOpenChange(false). Real primitive is keyboard-accessible. */}
        <button data-testid="dialog-dismiss" onClick={() => onOpenChange?.(false)}>
          dismiss
        </button>
        {children}
      </div>
    ) : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    className,
    variant,
  }: {
    children: React.ReactNode;
    className?: string;
    variant?: string;
  }) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

// ===========================================================================
// usePublishedChangeGuard (story 7-6, AC-5 / AC-6)
// ===========================================================================

describe('usePublishedChangeGuard', () => {
  // AC-6 (story 7-6:19): on a DRAFT month behaviour is unchanged — the run
  //   fires immediately with ack=false and no dialog appears.
  it('on a DRAFT month, guard(run) fires run(false) immediately and keeps the dialog closed', () => {
    const { result } = renderHook(() => usePublishedChangeGuard(false));
    const run = vi.fn();
    act(() => result.current.guard(run));
    expect(run).toHaveBeenCalledWith(false);
    expect(result.current.dialogOpen).toBe(false);
  });

  // AC-5 (story 7-6:18): on a PUBLISHED month the run is stashed and the
  //   confirmation dialog opens instead of firing the mutation.
  it('on a PUBLISHED month, guard(run) opens the dialog and does NOT fire run', () => {
    const { result } = renderHook(() => usePublishedChangeGuard(true));
    const run = vi.fn();
    act(() => result.current.guard(run));
    expect(run).not.toHaveBeenCalled();
    expect(result.current.dialogOpen).toBe(true);
  });

  // AC-5 (story 7-6:18): confirming re-fires the mutation with ack=true.
  it('confirm() fires the stashed run with acknowledge=true and closes the dialog', () => {
    const { result } = renderHook(() => usePublishedChangeGuard(true));
    const run = vi.fn();
    act(() => result.current.guard(run));
    act(() => result.current.confirm());
    expect(run).toHaveBeenCalledWith(true);
    expect(result.current.dialogOpen).toBe(false);
  });

  // AC-5 (story 7-6:18): cancelling leaves the schedule untouched — the
  //   stashed run is dropped so a later confirm() fires nothing.
  it('cancel() drops the stashed run so a later confirm() fires nothing', () => {
    const { result } = renderHook(() => usePublishedChangeGuard(true));
    const run = vi.fn();
    act(() => result.current.guard(run));
    act(() => result.current.cancel());
    expect(result.current.dialogOpen).toBe(false);
    act(() => result.current.confirm());
    expect(run).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PublishedChangeDialog (story 7-6, AC-5 / AC-8)
// ===========================================================================

describe('PublishedChangeDialog', () => {
  // AC-8 (story 7-6:21): the dialog is fully translated — title, description,
  //   and both actions come from the admin.publishedChange keys.
  it('renders title, description and both actions when open', () => {
    render(<PublishedChangeDialog open onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('dialogTitle')).toBeInTheDocument();
    expect(screen.getByText('dialogDescription')).toBeInTheDocument();
    expect(screen.getByText('confirm')).toBeInTheDocument();
    expect(screen.getByText('cancel')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<PublishedChangeDialog open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByTestId('alert-dialog')).not.toBeInTheDocument();
  });

  it('fires onConfirm and onCancel from the footer actions', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<PublishedChangeDialog open onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('confirm'));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByText('cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  // AC-8 (story 7-6:21): the dialog is keyboard-accessible — dismissing it via
  //   ESC or an outside click (Radix onOpenChange(false)) must route to onCancel
  //   so the schedule stays untouched (review F5 — previously unexercised).
  it('routes an onOpenChange(false) dismissal (ESC / outside click) to onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<PublishedChangeDialog open onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('dialog-dismiss'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PlanningHealthBar amended badge (story 7-6, AC-7)
// ===========================================================================

describe('PlanningHealthBar amended badge', () => {
  const defaultProps = {
    hardViolationCount: 0,
    softViolationCount: 0,
    holeCount: 0,
    totalShifts: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-7 (story 7-6:20): on a published-and-amended month the badge shows the
  //   last amendment date and count.
  it('shows the amended badge when amendmentCount > 0', () => {
    render(
      <PlanningHealthBar
        {...defaultProps}
        publicationStatus={{
          status: 'PUBLISHED',
          publishedAt: '2026-07-01T00:00:00.000Z',
          publishedBy: null,
          amendedAt: '2026-07-08T00:00:00.000Z',
          amendmentCount: 2,
        }}
      />
    );
    expect(screen.getByText('amended')).toBeInTheDocument();
  });

  it('hides the amended badge when amendmentCount is 0', () => {
    render(
      <PlanningHealthBar
        {...defaultProps}
        publicationStatus={{
          status: 'PUBLISHED',
          publishedAt: '2026-07-01T00:00:00.000Z',
          publishedBy: null,
          amendedAt: null,
          amendmentCount: 0,
        }}
      />
    );
    expect(screen.queryByText('amended')).not.toBeInTheDocument();
  });
});
