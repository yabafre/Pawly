import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PreCheckoutForm } from '../_components/PreCheckoutForm';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock useCheckout hook
const mockCheckout = vi.fn();
let mockIsPending = false;
vi.mock('../_hooks/useCheckout', () => ({
  useCheckout: () => ({
    checkout: mockCheckout,
    isPending: mockIsPending,
    error: null,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock the validators package
vi.mock('@pawly/validators', () => ({
  createCheckoutSessionSchema: {
    shape: {
      clinicName: { safeParse: (v: string) => ({ success: v.length >= 2 }) },
      adminName: { safeParse: (v: string) => ({ success: v.length >= 2 }) },
      adminEmail: { safeParse: (v: string) => ({ success: /^.+@.+\..+$/.test(v) }) },
    },
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

// Store original window.location for safe cleanup
const originalLocation = window.location;

describe('PreCheckoutForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPending = false;
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('renders all form fields', () => {
    renderWithProviders(<PreCheckoutForm priceId="price_test" />);

    expect(screen.getByLabelText('clinicNameLabel')).toBeInTheDocument();
    expect(screen.getByLabelText('adminNameLabel')).toBeInTheDocument();
    expect(screen.getByLabelText('adminEmailLabel')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    renderWithProviders(<PreCheckoutForm priceId="price_test" />);

    expect(screen.getByRole('button', { name: /submitButton/i })).toBeInTheDocument();
  });

  it('shows placeholders', () => {
    renderWithProviders(<PreCheckoutForm priceId="price_test" />);

    expect(screen.getByPlaceholderText('clinicNamePlaceholder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('adminNamePlaceholder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('adminEmailPlaceholder')).toBeInTheDocument();
  });

  it('validates clinicName on change with short value', async () => {
    renderWithProviders(<PreCheckoutForm priceId="price_test" />);

    const input = screen.getByLabelText('clinicNameLabel');
    fireEvent.change(input, { target: { value: 'A' } });
    fireEvent.blur(input);

    await waitFor(() => {
      const alerts = screen.queryAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  it('validates adminEmail on change with invalid email', async () => {
    renderWithProviders(<PreCheckoutForm priceId="price_test" />);

    const input = screen.getByLabelText('adminEmailLabel');
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.blur(input);

    await waitFor(() => {
      const alerts = screen.queryAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  it('submits form and calls checkout', async () => {
    mockCheckout.mockImplementation((_data: unknown, callbacks: { onSuccess: (result: { url: string }) => void }) => {
      callbacks.onSuccess({ url: 'https://checkout.stripe.com/test' });
    });

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });

    renderWithProviders(<PreCheckoutForm priceId="price_test_123" />);

    fireEvent.change(screen.getByLabelText('clinicNameLabel'), { target: { value: 'Test Clinic' } });
    fireEvent.change(screen.getByLabelText('adminNameLabel'), { target: { value: 'Dr. Test' } });
    fireEvent.change(screen.getByLabelText('adminEmailLabel'), { target: { value: 'test@clinic.com' } });

    const submitButton = screen.getByRole('button', { name: /submitButton/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          clinicName: 'Test Clinic',
          adminName: 'Dr. Test',
          adminEmail: 'test@clinic.com',
          priceId: 'price_test_123',
          locale: 'fr',
        }),
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });
  });

  it('shows error toast on checkout failure', async () => {
    const { toast } = await import('sonner');
    mockCheckout.mockImplementation((_data: unknown, callbacks: { onError: () => void }) => {
      callbacks.onError();
    });

    renderWithProviders(<PreCheckoutForm priceId="price_test" />);

    fireEvent.change(screen.getByLabelText('clinicNameLabel'), { target: { value: 'Test Clinic' } });
    fireEvent.change(screen.getByLabelText('adminNameLabel'), { target: { value: 'Dr. Test' } });
    fireEvent.change(screen.getByLabelText('adminEmailLabel'), { target: { value: 'test@clinic.com' } });

    fireEvent.click(screen.getByRole('button', { name: /submitButton/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('error');
    });
  });

  it('disables button when isPending is true', () => {
    mockIsPending = true;

    renderWithProviders(<PreCheckoutForm priceId="price_test" />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(screen.getByText('submitting')).toBeInTheDocument();
  });

  it('disables submit button when form fields are empty (canSubmit=false)', async () => {
    renderWithProviders(<PreCheckoutForm priceId="price_test" />);

    const clinicInput = screen.getByLabelText('clinicNameLabel');
    fireEvent.change(clinicInput, { target: { value: 'A' } });
    fireEvent.blur(clinicInput);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  it('has accessible form with required fields', () => {
    renderWithProviders(<PreCheckoutForm priceId="price_test" />);

    const clinicInput = screen.getByLabelText('clinicNameLabel');
    const nameInput = screen.getByLabelText('adminNameLabel');
    const emailInput = screen.getByLabelText('adminEmailLabel');

    expect(clinicInput).toHaveAttribute('required');
    expect(nameInput).toHaveAttribute('required');
    expect(emailInput).toHaveAttribute('required');
  });

  it('all inputs have h-12 for 48px touch targets', () => {
    renderWithProviders(<PreCheckoutForm priceId="price_test" />);

    const inputs = screen.getAllByRole('textbox');
    inputs.forEach(input => {
      expect(input.className).toContain('h-12');
    });
  });
});
