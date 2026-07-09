import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GenerationResultView } from '../_components/GenerationResultView';
import { ConfirmRegenerateDialog } from '../_components/ConfirmRegenerateDialog';
import { MonthShiftsSummary } from '../_components/MonthShiftsSummary';
import { GenerationPanel } from '../_components/GenerationPanel';
import type { GenerationResult } from '@pawly/validators';

vi.mock('../_hooks/useGeneration', () => ({
  useGeneration: vi.fn(() => ({
    shifts: [],
    isLoadingShifts: false,
    isFetchingShifts: false,
    refetchShifts: vi.fn(),
    generatePlan: vi.fn(),
    isGenerating: false,
    deleteGenerated: vi.fn(),
    isDeleting: false,
    invalidateAll: vi.fn(),
  })),
}));

vi.mock('../_hooks/usePublish', () => ({
  usePublish: vi.fn(() => ({
    publicationStatus: { status: 'DRAFT', publishedAt: null, publishedBy: null },
    isLoadingStatus: false,
    publishPreview: undefined,
    isLoadingPreview: false,
    publishPlan: vi.fn(),
    isPublishing: false,
  })),
}));

vi.mock('../templates/_hooks/useTemplates', () => ({
  useTemplates: vi.fn(() => ({
    templates: [
      { id: 'tpl-1', name: 'Template A' },
      { id: 'tpl-2', name: 'Template B' },
    ],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: vi.fn(),
    isCreating: false,
    updateTemplate: vi.fn(),
    isUpdating: false,
    deleteTemplate: vi.fn(),
    isDeleting: false,
    duplicateTemplate: vi.fn(),
    isDuplicating: false,
    invalidateTemplates: vi.fn(),
  })),
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

const defaultPanelProps = {
  month: '2026-03',
  onMonthChange: vi.fn(),
};

describe('GenerationPanel', () => {
  it('renders title and subtitle', () => {
    render(<GenerationPanel {...defaultPanelProps} />, { wrapper: Wrapper });
    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('subtitle')).toBeInTheDocument();
  });

  it('renders month label and template label', () => {
    render(<GenerationPanel {...defaultPanelProps} />, { wrapper: Wrapper });
    expect(screen.getByText('monthLabel')).toBeInTheDocument();
    expect(screen.getByText('templateLabel')).toBeInTheDocument();
  });

  it('renders generate button with correct text', () => {
    render(<GenerationPanel {...defaultPanelProps} />, { wrapper: Wrapper });
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('generateButton')).toBeInTheDocument();
  });

  it('shows loading state when generating', async () => {
    const { useGeneration } = await import('../_hooks/useGeneration');
    vi.mocked(useGeneration).mockReturnValue({
      shifts: [],
      isLoadingShifts: false,
      isFetchingShifts: false,
      refetchShifts: vi.fn(),
      generatePlan: vi.fn(),
      isGenerating: true,
      deleteGenerated: vi.fn(),
      isDeleting: false,
      invalidateAll: vi.fn(),
    } as any);

    render(<GenerationPanel {...defaultPanelProps} />, { wrapper: Wrapper });
    expect(screen.getByText('generating')).toBeInTheDocument();
  });

  it('routes delete through the published-change dialog and acknowledges (story 11-1)', async () => {
    const deleteGeneratedSpy = vi.fn();
    const { useGeneration } = await import('../_hooks/useGeneration');
    vi.mocked(useGeneration).mockReturnValue({
      shifts: [
        {
          id: 's1',
          source: 'GENERATED',
          shiftTypeCode: 'SURGERY',
          employee: { id: 'e1' },
        },
      ],
      isLoadingShifts: false,
      isFetchingShifts: false,
      refetchShifts: vi.fn(),
      generatePlan: vi.fn(),
      isGenerating: false,
      deleteGenerated: deleteGeneratedSpy,
      isDeleting: false,
      invalidateAll: vi.fn(),
    } as any);

    const { usePublish } = await import('../_hooks/usePublish');
    vi.mocked(usePublish).mockReturnValue({
      publicationStatus: {
        status: 'PUBLISHED',
        publishedAt: '2026-07-01',
        publishedBy: 'admin',
      },
      isLoadingStatus: false,
      publishPreview: undefined,
      isLoadingPreview: false,
      publishPlan: vi.fn(),
      isPublishing: false,
    } as any);

    render(<GenerationPanel {...defaultPanelProps} />, { wrapper: Wrapper });

    // 1) open the "delete generated" confirmation
    fireEvent.click(screen.getByText('deleteGenerated'));
    // 2) confirm deletion → closes ConfirmDeleteDialog, opens PublishedChangeDialog
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    // 3) confirm the published change → fires deleteGenerated with ack: true
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));

    expect(deleteGeneratedSpy).toHaveBeenCalledWith({
      month: '2026-03',
      acknowledgePublishedChange: true,
    });
  });
});

describe('GenerationResultView', () => {
  const fullResult: GenerationResult = {
    assignments: [
      {
        id: 's1',
        date: '2026-03-02',
        startTime: '08:00',
        endTime: '12:00',
        shiftTypeCode: 'SURGERY',
        employeeId: 'e1',
        employeeName: 'Alice Martin',
      },
    ],
    holes: [
      {
        date: '2026-03-03',
        shiftTypeCode: 'RECEPTION',
        requiredStaff: 2,
        assignedStaff: 1,
        reason: 'Not enough eligible employees',
      },
    ],
    violations: {
      hard: [
        {
          ruleId: 'r1',
          ruleName: 'Min 2 vets',
          category: 'STAFFING_MINIMUM',
          message: 'Only 1 eligible for SURGERY on 2026-03-03',
          severity: 'blocking',
        },
      ],
      soft: [
        {
          ruleId: 'r2',
          ruleName: 'Max Saturdays',
          category: 'ROTATION_EQUITY',
          message: 'Employee has 3 Saturday shifts',
          severity: 'warning',
        },
      ],
    },
    stats: {
      totalSlots: 10,
      filledSlots: 8,
      holeCount: 1,
      hardViolationCount: 1,
      softWarningCount: 1,
    },
  };

  it('renders assignment summary stats', () => {
    render(<GenerationResultView result={fullResult} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('does not render inline holes or violations (moved to MonthShiftsSummary)', () => {
    render(<GenerationResultView result={fullResult} />, {
      wrapper: Wrapper,
    });

    // Holes and violations are no longer displayed inline in GenerationResultView
    expect(screen.queryByText(/2026-03-03.*RECEPTION/)).not.toBeInTheDocument();
    expect(screen.queryByText('Not enough eligible employees')).not.toBeInTheDocument();
    expect(screen.queryByText('Min 2 vets')).not.toBeInTheDocument();
    expect(screen.queryByText('Max Saturdays')).not.toBeInTheDocument();
  });

  it('shows success state when no issues', () => {
    const cleanResult: GenerationResult = {
      assignments: fullResult.assignments,
      holes: [],
      violations: { hard: [], soft: [] },
      stats: {
        totalSlots: 1,
        filledSlots: 1,
        holeCount: 0,
        hardViolationCount: 0,
        softWarningCount: 0,
      },
    };

    render(<GenerationResultView result={cleanResult} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText('result.allGood')).toBeInTheDocument();
  });

  it('renders translated stat labels', () => {
    render(<GenerationResultView result={fullResult} />, {
      wrapper: Wrapper,
    });

    // useTranslations mock returns the key
    expect(screen.getByText('stats.totalSlots')).toBeInTheDocument();
    expect(screen.getByText('stats.filledSlots')).toBeInTheDocument();
    expect(screen.getByText('stats.holes')).toBeInTheDocument();
  });
});

describe('ConfirmRegenerateDialog', () => {
  it('renders dialog content when open', () => {
    render(
      <ConfirmRegenerateDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        existingCount={5}
      />,
      { wrapper: Wrapper }
    );

    // useTranslations mock returns the key
    expect(screen.getByText('title')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ConfirmRegenerateDialog
        open={false}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        existingCount={5}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.queryByText('title')).not.toBeInTheDocument();
  });

  it('renders confirm and cancel buttons', () => {
    render(
      <ConfirmRegenerateDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        existingCount={5}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByText('confirm')).toBeInTheDocument();
    expect(screen.getByText('cancel')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmRegenerateDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        existingCount={5}
      />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByText('confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('MonthShiftsSummary', () => {
  const mockShifts = [
    {
      id: 's1',
      date: '2026-03-02',
      startTime: '08:00',
      endTime: '12:00',
      shiftTypeCode: 'SURGERY',
      source: 'GENERATED',
      employee: { id: 'e1', firstName: 'Alice', lastName: 'Martin', color: null, jobType: 'VET' },
    },
    {
      id: 's2',
      date: '2026-03-02',
      startTime: '14:00',
      endTime: '18:00',
      shiftTypeCode: 'RECEPTION',
      source: 'MANUAL',
      employee: { id: 'e2', firstName: 'Bob', lastName: 'Dupont', color: null, jobType: 'ASV' },
    },
    {
      id: 's3',
      date: '2026-03-03',
      startTime: '08:00',
      endTime: '12:00',
      shiftTypeCode: 'SURGERY',
      source: 'GENERATED',
      employee: { id: 'e1', firstName: 'Alice', lastName: 'Martin', color: null, jobType: 'VET' },
    },
  ];

  it('renders nothing when loading', () => {
    const { container } = render(
      <MonthShiftsSummary shifts={[]} isLoading={true} month="2026-03" />,
      { wrapper: Wrapper }
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no shifts', () => {
    const { container } = render(
      <MonthShiftsSummary shifts={[]} isLoading={false} month="2026-03" />,
      { wrapper: Wrapper }
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders stats with correct counts', () => {
    render(<MonthShiftsSummary shifts={mockShifts} isLoading={false} month="2026-03" />, {
      wrapper: Wrapper,
    });

    // Total shifts: 3 (rendered as text content in MiniStat)
    const allText = screen.getAllByText('3');
    expect(allText.length).toBeGreaterThanOrEqual(1);
  });

  it('renders shift type badges', () => {
    render(<MonthShiftsSummary shifts={mockShifts} isLoading={false} month="2026-03" />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText(/SURGERY/)).toBeInTheDocument();
    expect(screen.getByText(/RECEPTION/)).toBeInTheDocument();
  });

  it('renders delete button when generated shifts exist', () => {
    const onDelete = vi.fn();
    render(
      <MonthShiftsSummary
        shifts={mockShifts}
        isLoading={false}
        month="2026-03"
        onDeleteGenerated={onDelete}
      />,
      { wrapper: Wrapper }
    );

    const deleteBtn = screen.getByText('deleteGenerated');
    expect(deleteBtn).toBeInTheDocument();
  });

  it('disables delete button when isDeleting', () => {
    render(
      <MonthShiftsSummary
        shifts={mockShifts}
        isLoading={false}
        month="2026-03"
        onDeleteGenerated={vi.fn()}
        isDeleting={true}
      />,
      { wrapper: Wrapper }
    );

    const deleteBtn = screen.getByText('deleteGenerated').closest('button');
    expect(deleteBtn).toBeDisabled();
  });

  it('disables delete button when isGenerating', () => {
    render(
      <MonthShiftsSummary
        shifts={mockShifts}
        isLoading={false}
        month="2026-03"
        onDeleteGenerated={vi.fn()}
        isGenerating={true}
      />,
      { wrapper: Wrapper }
    );

    const deleteBtn = screen.getByText('deleteGenerated').closest('button');
    expect(deleteBtn).toBeDisabled();
  });
});
