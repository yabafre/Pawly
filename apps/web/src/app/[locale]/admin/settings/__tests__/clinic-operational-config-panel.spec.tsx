import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClinicOperationalConfigPanel } from '../_components/ClinicOperationalConfigPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'fr',
}));

// Mock Checkbox so onCheckedChange fires correctly in jsdom
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ id, checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      role="checkbox"
      id={id}
      checked={!!checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

const mockUpdateOperationalConfig = vi.fn();
const mockUseClinicOperationalConfig = vi.fn().mockReturnValue({
  config: {
    workDays: ['MONDAY', 'TUESDAY'],
    defaultStartTime: '08:00',
    defaultEndTime: '18:00',
    closedDays: [],
    specialDays: [],
  },
  isPending: false,
  error: null,
  updateOperationalConfig: mockUpdateOperationalConfig,
  isUpdating: false,
});

vi.mock('../_hooks/useClinicOperationalConfig', () => ({
  useClinicOperationalConfig: (...args: any[]) => mockUseClinicOperationalConfig(...args),
}));

describe('ClinicOperationalConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClinicOperationalConfig.mockReturnValue({
      config: {
        workDays: ['MONDAY', 'TUESDAY'],
        defaultStartTime: '08:00',
        defaultEndTime: '18:00',
        closedDays: [],
        specialDays: [],
      },
      isPending: false,
      error: null,
      updateOperationalConfig: mockUpdateOperationalConfig,
      isUpdating: false,
    });
  });

  it('renders loading skeleton when pending and no config', () => {
    mockUseClinicOperationalConfig.mockReturnValue({
      config: null,
      isPending: true,
      error: null,
      updateOperationalConfig: mockUpdateOperationalConfig,
      isUpdating: false,
    });

    const { container } = render(<ClinicOperationalConfigPanel />);

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders form values from operational config', async () => {
    render(<ClinicOperationalConfigPanel />);

    await waitFor(() => {
      expect(screen.getByLabelText('fields.defaultStartTime')).toHaveValue('08:00');
      expect(screen.getByLabelText('fields.defaultEndTime')).toHaveValue('18:00');
    });
  });

  it('submits valid payload via hook mutation', async () => {
    render(<ClinicOperationalConfigPanel />);

    fireEvent.click(screen.getByText('actions.save'));

    await waitFor(() => {
      expect(mockUpdateOperationalConfig).toHaveBeenCalledTimes(1);
      expect(mockUpdateOperationalConfig).toHaveBeenCalledWith({
        workDays: ['MONDAY', 'TUESDAY'],
        defaultStartTime: '08:00',
        defaultEndTime: '18:00',
        is24_7: false,
        closedDays: [],
        specialDays: [],
      });
    });
  });

  it('shows inline validation and blocks submit for invalid values', async () => {
    render(<ClinicOperationalConfigPanel />);

    fireEvent.change(screen.getByLabelText('fields.defaultEndTime'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('actions.save'));

    await waitFor(() => {
      expect(screen.getByText('validation.invalidTimeFormat')).toBeDefined();
      expect(mockUpdateOperationalConfig).not.toHaveBeenCalled();
    });
  });

  it('toggles work day checkbox without duplicate updates', async () => {
    render(<ClinicOperationalConfigPanel />);

    fireEvent.click(screen.getByLabelText('days.WEDNESDAY'));
    fireEvent.click(screen.getByText('actions.save'));

    await waitFor(() => {
      expect(mockUpdateOperationalConfig).toHaveBeenCalledTimes(1);
      expect(mockUpdateOperationalConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY'],
        })
      );
    });
  });

  // AC-1: toggling "Open 24/7" disables (greys) the opening/closing time inputs.
  it('disables both time inputs when the 24/7 toggle is on', async () => {
    render(<ClinicOperationalConfigPanel />);

    expect(screen.getByLabelText('fields.defaultStartTime')).not.toBeDisabled();
    expect(screen.getByLabelText('fields.defaultEndTime')).not.toBeDisabled();

    fireEvent.click(screen.getByLabelText('fields.is24_7'));

    await waitFor(() => {
      expect(screen.getByLabelText('fields.defaultStartTime')).toBeDisabled();
      expect(screen.getByLabelText('fields.defaultEndTime')).toBeDisabled();
    });
  });

  // AC-1 + AC-2 at the UI layer: once 24/7 is on, equal start/end times submit
  // successfully (the end>start rule is short-circuited) carrying is24_7: true.
  it('submits is24_7 true and tolerates equal times once toggled on', async () => {
    mockUseClinicOperationalConfig.mockReturnValue({
      config: {
        workDays: ['MONDAY', 'TUESDAY'],
        defaultStartTime: '00:00',
        defaultEndTime: '00:00',
        closedDays: [],
        specialDays: [],
      },
      isPending: false,
      error: null,
      updateOperationalConfig: mockUpdateOperationalConfig,
      isUpdating: false,
    });

    render(<ClinicOperationalConfigPanel />);

    fireEvent.click(screen.getByLabelText('fields.is24_7'));
    fireEvent.click(screen.getByText('actions.save'));

    await waitFor(() => {
      expect(mockUpdateOperationalConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          is24_7: true,
          defaultStartTime: '00:00',
          defaultEndTime: '00:00',
        })
      );
    });
  });
});
