import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublishConfirmDialog } from '../_components/PublishConfirmDialog';
import { PlanningHealthBar } from '../_components/PlanningHealthBar';
import { HealthBarDetailPopover } from '../_components/HealthBarDetailPopover';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// next-intl is globally mocked in vitest.setup.ts:
//   useTranslations: () => (key: string) => key

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
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({
    children,
    disabled,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
  }) => <button disabled={disabled}>{children}</button>,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    children,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({
    children,
    asChild,
    ...rest
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    [key: string]: unknown;
  }) => (
    <div data-testid="popover-trigger" {...rest}>
      {asChild ? children : <button>{children}</button>}
    </div>
  ),
  PopoverContent: ({
    children,
    align,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    align?: string;
    className?: string;
    [key: string]: unknown;
  }) => (
    <div data-testid="popover-content" {...rest}>
      {children}
    </div>
  ),
  PopoverHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-header">{children}</div>
  ),
  PopoverTitle: ({ children }: { children: React.ReactNode }) => (
    <h3 data-testid="popover-title">{children}</h3>
  ),
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
// PublishConfirmDialog
// ===========================================================================

describe('PublishConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    softViolationCount: 0,
    isPublishing: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render dialog when open is true', () => {
    render(<PublishConfirmDialog {...defaultProps} />);

    expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
    expect(screen.getByText('confirmTitle')).toBeInTheDocument();
  });

  it('should not render dialog when open is false', () => {
    render(<PublishConfirmDialog {...defaultProps} open={false} />);

    expect(screen.queryByTestId('alert-dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('confirmTitle')).not.toBeInTheDocument();
  });

  it('should show soft warning count in description when softViolationCount > 0', () => {
    render(<PublishConfirmDialog {...defaultProps} softViolationCount={3} />);

    expect(screen.getByText('confirmDescriptionWithWarnings')).toBeInTheDocument();
  });

  it('should show standard description when softViolationCount is 0', () => {
    render(<PublishConfirmDialog {...defaultProps} softViolationCount={0} />);

    expect(screen.getByText('confirmDescription')).toBeInTheDocument();
  });

  it('should call onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<PublishConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

    const confirmButton = screen.getByText('confirmPublish');
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should show cancel button with cancel text', () => {
    render(<PublishConfirmDialog {...defaultProps} />);

    expect(screen.getByText('cancel')).toBeInTheDocument();
  });

  it('should disable buttons when isPublishing is true', () => {
    render(<PublishConfirmDialog {...defaultProps} isPublishing={true} />);

    const cancelButton = screen.getByText('publishing').closest('button');
    expect(cancelButton).toBeDisabled();

    const cancelBtn = screen.getByText('cancel').closest('button');
    expect(cancelBtn).toBeDisabled();
  });

  it('should show publishing text when isPublishing', () => {
    render(<PublishConfirmDialog {...defaultProps} isPublishing={true} />);

    expect(screen.getByText('publishing')).toBeInTheDocument();
    expect(screen.queryByText('confirmPublish')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// PlanningHealthBar
// ===========================================================================

describe('PlanningHealthBar', () => {
  const defaultProps = {
    hardViolationCount: 0,
    softViolationCount: 0,
    holeCount: 0,
    totalShifts: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Existing tests (updated for new props) ---

  it('should render hard conflict count in red', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} hardViolationCount={3} />);

    const roseBox = container.querySelector('.bg-rose-100');
    expect(roseBox).not.toBeNull();
  });

  it('should render soft warning count in orange', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} softViolationCount={2} />);

    const orangeBox = container.querySelector('.bg-orange-100');
    expect(orangeBox).not.toBeNull();
  });

  it('should render total shifts count', () => {
    render(<PlanningHealthBar {...defaultProps} />);

    expect(screen.getByText('title')).toBeInTheDocument();
  });

  it('should compute and display ready percentage', () => {
    render(<PlanningHealthBar {...defaultProps} hardViolationCount={1} softViolationCount={1} />);

    const subtitle = screen.getByText(
      (content) =>
        content.includes('conflicts') && content.includes('warnings') && content.includes('ready')
    );
    expect(subtitle).toBeInTheDocument();
  });

  it('should show healthy message when no violations exist', () => {
    render(<PlanningHealthBar {...defaultProps} />);

    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('should disable publish button when hardViolationCount > 0', () => {
    const onPublish = vi.fn();
    render(<PlanningHealthBar {...defaultProps} hardViolationCount={2} onPublish={onPublish} />);

    const publishButton = screen.getByText('publish').closest('button');
    expect(publishButton).toBeDisabled();
  });

  it('should enable publish button when hardViolationCount === 0', () => {
    const onPublish = vi.fn();
    render(<PlanningHealthBar {...defaultProps} softViolationCount={3} onPublish={onPublish} />);

    const publishButton = screen.getByText('publish').closest('button');
    expect(publishButton).not.toBeDisabled();
  });

  it('should call onPublish when publish button is clicked', () => {
    const onPublish = vi.fn();
    render(<PlanningHealthBar {...defaultProps} onPublish={onPublish} />);

    const publishButton = screen.getByText('publish').closest('button')!;
    fireEvent.click(publishButton);

    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('should not render publish button when onPublish is undefined', () => {
    render(<PlanningHealthBar {...defaultProps} />);

    expect(screen.queryByText('publish')).not.toBeInTheDocument();
  });

  it('should show blocked message when hard conflicts exist', () => {
    render(<PlanningHealthBar {...defaultProps} hardViolationCount={1} onPublish={vi.fn()} />);

    expect(screen.getByText('publishBlocked')).toBeInTheDocument();
  });

  it('should not show blocked message when no hard conflicts', () => {
    render(<PlanningHealthBar {...defaultProps} />);

    expect(screen.queryByText('publishBlocked')).not.toBeInTheDocument();
  });

  it('should have section element', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} />);

    const section = container.querySelector('section');
    expect(section).not.toBeNull();
  });

  it('should render segmented bar with rose segment for hard violations', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} hardViolationCount={3} />);

    // hardWidth = round((3/10) * 100) = 30%
    const roseSegment = container.querySelector('.bg-rose-500');
    expect(roseSegment).not.toBeNull();
    expect(roseSegment).toHaveStyle({ width: '30%' });
  });

  it('should render segmented bar with orange segment for soft violations', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} softViolationCount={4} />);

    // softWidth = round((4/10) * 100) = 40%
    const orangeSegment = container.querySelector('.bg-orange-400');
    expect(orangeSegment).not.toBeNull();
    expect(orangeSegment).toHaveStyle({ width: '40%' });
  });

  it('should render segmented bar with teal segment for healthy shifts', () => {
    const { container } = render(
      <PlanningHealthBar {...defaultProps} hardViolationCount={1} softViolationCount={2} />
    );

    // hardWidth = 10%, softWidth = 20%, healthyWidth = 70%
    const primarySegments = container.querySelectorAll('.bg-primary');
    const barSegment = Array.from(primarySegments).find((el) =>
      el.getAttribute('style')?.includes('width')
    );
    expect(barSegment).not.toBeUndefined();
    expect(barSegment).toHaveStyle({ width: '70%' });
  });

  it('should show CheckCircle icon when fully healthy', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} />);

    const healthyBox = container.querySelector('.bg-muted');
    expect(healthyBox).not.toBeNull();
  });

  it('should show publish button with title attribute when hard conflicts exist', () => {
    render(<PlanningHealthBar {...defaultProps} hardViolationCount={2} onPublish={vi.fn()} />);

    const publishButton = screen.getByText('publish').closest('button')!;
    expect(publishButton).toHaveAttribute('title', 'publishBlocked');
  });

  // --- New tests for holes ---

  it('should include holes in subtitle text', () => {
    render(<PlanningHealthBar {...defaultProps} holeCount={3} />);

    const subtitle = screen.getByText((content) => content.includes('holes'));
    expect(subtitle).toBeInTheDocument();
  });

  it('should render hole segment with neutral color', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} holeCount={2} />);

    // holeWidth = floor((2/12) * 100) = 16% (totalPositions = 10 + 2 = 12)
    const holeSegment = container.querySelector('.bg-muted-foreground');
    expect(holeSegment).not.toBeNull();
    expect(holeSegment).toHaveStyle({ width: '16%' });
  });

  it('should calculate segment widths including holes correctly', () => {
    const { container } = render(
      <PlanningHealthBar
        hardViolationCount={2}
        softViolationCount={1}
        holeCount={3}
        totalShifts={10}
      />
    );

    // totalPositions = 10 + 3 = 13
    // hardWidth = floor(2/13 * 100) = 15%
    // softWidth = floor(1/13 * 100) = 7%
    // holeWidth = floor(3/13 * 100) = 23%
    // healthyWidth = 100 - 15 - 7 - 23 = 55%
    const roseSegment = container.querySelector('.bg-rose-500');
    expect(roseSegment).toHaveStyle({ width: '15%' });

    const orangeSegment = container.querySelector('.bg-orange-400');
    expect(orangeSegment).toHaveStyle({ width: '7%' });

    const holeSegment = container.querySelector('.bg-muted-foreground');
    expect(holeSegment).toHaveStyle({ width: '23%' });
  });

  it('should show orange icon when only holes exist (no hard conflicts)', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} holeCount={2} />);

    const orangeBox = container.querySelector('.bg-orange-100');
    expect(orangeBox).not.toBeNull();
  });

  // --- Empty state tests ---

  it('should show empty state when totalShifts is 0 and no violations', () => {
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        holeCount={0}
        totalShifts={0}
      />
    );

    expect(screen.getByText('emptyState')).toBeInTheDocument();
  });

  it('should show Circle icon in empty state', () => {
    const { container } = render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        holeCount={0}
        totalShifts={0}
      />
    );

    // Empty state shows muted icon box
    const neutralBox = container.querySelector('.bg-muted');
    expect(neutralBox).not.toBeNull();
  });

  it('should not show empty state when totalShifts > 0', () => {
    render(<PlanningHealthBar {...defaultProps} />);

    expect(screen.queryByText('emptyState')).not.toBeInTheDocument();
  });

  it('should not show empty state when holes exist even if totalShifts is 0', () => {
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        holeCount={5}
        totalShifts={0}
      />
    );

    expect(screen.queryByText('emptyState')).not.toBeInTheDocument();
  });

  // --- Published state tests ---

  it('should show published badge when status is PUBLISHED', () => {
    render(
      <PlanningHealthBar
        {...defaultProps}
        publicationStatus={{
          status: 'PUBLISHED',
          publishedAt: '2026-02-24T10:00:00Z',
          publishedBy: 'admin',
        }}
        onPublish={vi.fn()}
      />
    );

    const badge = screen.getByTestId('badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('publishedAt');
  });

  it('should show published text without date when publishedAt is null', () => {
    render(
      <PlanningHealthBar
        {...defaultProps}
        publicationStatus={{
          status: 'PUBLISHED',
          publishedAt: null,
          publishedBy: null,
        }}
        onPublish={vi.fn()}
      />
    );

    const badge = screen.getByTestId('badge');
    expect(badge).toHaveTextContent('published');
  });

  it('should hide publish button when already published', () => {
    render(
      <PlanningHealthBar
        {...defaultProps}
        publicationStatus={{
          status: 'PUBLISHED',
          publishedAt: '2026-02-24T10:00:00Z',
          publishedBy: null,
        }}
        onPublish={vi.fn()}
      />
    );

    expect(screen.queryByText('publish')).not.toBeInTheDocument();
  });

  it('should show publish button when status is DRAFT', () => {
    render(
      <PlanningHealthBar
        {...defaultProps}
        publicationStatus={{
          status: 'DRAFT',
          publishedAt: null,
          publishedBy: null,
        }}
        onPublish={vi.fn()}
      />
    );

    expect(screen.getByText('publish')).toBeInTheDocument();
  });

  it('should not show published badge when status is DRAFT', () => {
    render(
      <PlanningHealthBar
        {...defaultProps}
        publicationStatus={{
          status: 'DRAFT',
          publishedAt: null,
          publishedBy: null,
        }}
      />
    );

    expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
  });

  // --- Accessibility tests ---

  it('should have role=progressbar on segmented bar', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} />);

    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar).not.toBeNull();
  });

  it('should have aria-valuenow reflecting ready percent', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} hardViolationCount={2} />);

    // readyPercent = round((8/10) * 100) = 80
    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar).toHaveAttribute('aria-valuenow', '80');
  });

  it('should have aria-valuemin=0 and aria-valuemax=100', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} />);

    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });

  it('should have aria-label on progressbar', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} />);

    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar).toHaveAttribute('aria-label');
    const label = progressbar?.getAttribute('aria-label') ?? '';
    expect(label).toContain('title');
  });

  it('should have aria-live=polite region for status updates', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} />);

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
  });

  it('should have role=status on the aria-live region', () => {
    const { container } = render(<PlanningHealthBar {...defaultProps} />);

    const statusRegion = container.querySelector('[role="status"]');
    expect(statusRegion).not.toBeNull();
  });

  // --- Pulse animation test ---

  it('should add animate-pulse class on publish button when healthy', () => {
    render(<PlanningHealthBar {...defaultProps} onPublish={vi.fn()} />);

    const publishButton = screen.getByText('publish').closest('button')!;
    expect(publishButton.className).toContain('motion-safe:animate-pulse');
  });

  it('should not add animate-pulse class when violations exist', () => {
    render(<PlanningHealthBar {...defaultProps} softViolationCount={1} onPublish={vi.fn()} />);

    const publishButton = screen.getByText('publish').closest('button')!;
    expect(publishButton.className).not.toContain('animate-pulse');
  });

  it('should not add animate-pulse on empty state', () => {
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        holeCount={0}
        totalShifts={0}
        onPublish={vi.fn()}
      />
    );

    const publishButton = screen.getByText('publish').closest('button')!;
    expect(publishButton.className).not.toContain('animate-pulse');
  });
});

// ===========================================================================
// HealthBarDetailPopover
// ===========================================================================

describe('HealthBarDetailPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeHardViolation = (category: string, message: string) => ({
    ruleId: '00000000-0000-0000-0000-000000000001',
    ruleName: 'Test Rule',
    category,
    message,
    severity: 'blocking' as const,
  });

  const makeSoftViolation = (category: string, message: string) => ({
    ruleId: '00000000-0000-0000-0000-000000000002',
    ruleName: 'Test Soft Rule',
    category,
    message,
    severity: 'warning' as const,
  });

  const makeHole = (date: string, shiftTypeCode: string) => ({
    date,
    shiftTypeCode,
    requiredStaff: 2,
    assignedStaff: 1,
    reason: 'Not enough staff',
  });

  it('should render children directly when no content', () => {
    render(
      <HealthBarDetailPopover>
        <span>trigger text</span>
      </HealthBarDetailPopover>
    );

    expect(screen.getByText('trigger text')).toBeInTheDocument();
    expect(screen.queryByTestId('popover')).not.toBeInTheDocument();
  });

  it('should render popover when hard violations exist', () => {
    render(
      <HealthBarDetailPopover
        violations={{
          hard: [makeHardViolation('STAFFING_MINIMUM', 'Not enough ASV')],
          soft: [],
        }}
      >
        <span>trigger text</span>
      </HealthBarDetailPopover>
    );

    expect(screen.getByTestId('popover')).toBeInTheDocument();
    expect(screen.getByText('detailTitle')).toBeInTheDocument();
  });

  it('should group hard violations by category', () => {
    render(
      <HealthBarDetailPopover
        violations={{
          hard: [
            makeHardViolation('STAFFING_MINIMUM', 'Staff issue 1'),
            makeHardViolation('STAFFING_MINIMUM', 'Staff issue 2'),
            makeHardViolation('SKILL_REQUIREMENT', 'Skill issue 1'),
          ],
          soft: [],
        }}
      >
        <span>trigger</span>
      </HealthBarDetailPopover>
    );

    // categoryStaffing (2) and categorySkill (1)
    expect(screen.getByText('categoryStaffing (2)')).toBeInTheDocument();
    expect(screen.getByText('categorySkill (1)')).toBeInTheDocument();
  });

  it('should group soft violations by category', () => {
    render(
      <HealthBarDetailPopover
        violations={{
          hard: [],
          soft: [
            makeSoftViolation('ROTATION_EQUITY', 'Equity issue'),
            makeSoftViolation('CONTRACT_COMPLIANCE', 'Contract issue'),
          ],
        }}
      >
        <span>trigger</span>
      </HealthBarDetailPopover>
    );

    expect(screen.getByText('categoryEquity (1)')).toBeInTheDocument();
    expect(screen.getByText('categoryContract (1)')).toBeInTheDocument();
  });

  it('should display violation messages', () => {
    render(
      <HealthBarDetailPopover
        violations={{
          hard: [makeHardViolation('STAFFING_MINIMUM', 'Missing 2 ASV on 2026-02-24')],
          soft: [],
        }}
      >
        <span>trigger</span>
      </HealthBarDetailPopover>
    );

    expect(screen.getByText('Missing 2 ASV on 2026-02-24')).toBeInTheDocument();
  });

  // Story 11-3 (AC3) — a statutory hard violation carries a localizable messageKey; the
  // popover must render the translated key, not the raw English `message`. (t is the
  // identity mock, so the rendered text is the key itself.)
  it('renders a statutory hard violation via its messageKey, not the raw message', () => {
    render(
      <HealthBarDetailPopover
        violations={{
          hard: [
            {
              ruleId: 'statutory:daily_work',
              ruleName: 'French labor-law limits',
              category: 'CONTRACT_COMPLIANCE',
              message: 'Statutory DAILY_WORK limit exceeded on 2026-08-03 (11 > 10)',
              messageKey: 'violations.statutory.dailyWork',
              messageParams: { date: '2026-08-03', actual: 11, limit: 10 },
              severity: 'blocking' as const,
            },
          ],
          soft: [],
        }}
      >
        <span>trigger</span>
      </HealthBarDetailPopover>
    );

    expect(screen.getByText('violations.statutory.dailyWork')).toBeInTheDocument();
    expect(
      screen.queryByText('Statutory DAILY_WORK limit exceeded on 2026-08-03 (11 > 10)')
    ).not.toBeInTheDocument();
  });

  it('should group holes by date', () => {
    render(
      <HealthBarDetailPopover
        holes={[
          makeHole('2026-02-24', 'MATIN'),
          makeHole('2026-02-24', 'SOIR'),
          makeHole('2026-02-25', 'MATIN'),
        ]}
      >
        <span>trigger</span>
      </HealthBarDetailPopover>
    );

    // Two date groups → two "holesOnDate" elements
    const holesHeaders = screen.getAllByText('holesOnDate');
    expect(holesHeaders).toHaveLength(2);
  });

  it('should display hole shift type codes and reasons', () => {
    render(
      <HealthBarDetailPopover holes={[makeHole('2026-02-24', 'MATIN')]}>
        <span>trigger</span>
      </HealthBarDetailPopover>
    );

    expect(screen.getByText(/MATIN — Not enough staff/)).toBeInTheDocument();
  });

  it('should render popover when only holes exist', () => {
    render(
      <HealthBarDetailPopover holes={[makeHole('2026-02-24', 'MATIN')]}>
        <span>trigger</span>
      </HealthBarDetailPopover>
    );

    expect(screen.getByTestId('popover')).toBeInTheDocument();
  });

  it('should support hover interaction on trigger and content without errors', () => {
    render(
      <HealthBarDetailPopover
        violations={{
          hard: [makeHardViolation('STAFFING_MINIMUM', 'Issue')],
          soft: [],
        }}
      >
        <button>trigger</button>
      </HealthBarDetailPopover>
    );

    const trigger = screen.getByTestId('popover-trigger');
    const content = screen.getByTestId('popover-content');

    // Hover interactions should not throw (handlers are attached)
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(content);
    fireEvent.mouseLeave(content);

    // Popover remains functional
    expect(screen.getByText('detailTitle')).toBeInTheDocument();
  });

  it('should render all three sections when hard, soft, and holes exist', () => {
    render(
      <HealthBarDetailPopover
        violations={{
          hard: [makeHardViolation('STAFFING_MINIMUM', 'Hard issue')],
          soft: [makeSoftViolation('ROTATION_EQUITY', 'Soft issue')],
        }}
        holes={[makeHole('2026-02-24', 'MATIN')]}
      >
        <span>trigger</span>
      </HealthBarDetailPopover>
    );

    expect(screen.getByText('categoryStaffing (1)')).toBeInTheDocument();
    expect(screen.getByText('categoryEquity (1)')).toBeInTheDocument();
    expect(screen.getByText('holesOnDate')).toBeInTheDocument();
  });
});
