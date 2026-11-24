import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { Modal } from '../components/ui/Modal';
import { StatusBadge, paymentStatusTone } from '../components/ui/StatusBadge';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';

afterEach(() => {
  vi.restoreAllMocks();
});

function renderWithProviders(initialPath = '/gate') {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <App />
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('Smart Parking SPA UI primitives & routing', () => {
  it('opens main manager shell directly without login screen and hides removed modules', () => {
    renderWithProviders('/gate');
    expect(screen.getByRole('link', { name: /Cổng Vào \/ Ra \(POS\)/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lịch sử Giao dịch/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Quản trị Danh mục/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /đăng nhập/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Tài khoản RBAC/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chưa mở ca/i)).not.toBeInTheDocument();
  });

  it('maps payment status to distinct semantic badge tones', () => {
    expect(paymentStatusTone('Thành công')).toBe('emerald');
    expect(paymentStatusTone('Hoàn tiền')).toBe('amber');
    expect(paymentStatusTone('Thất bại')).toBe('rose');
  });

  it('closes accessible Modal on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hộp thoại thử nghiệm">
        <StatusBadge tone="indigo">Test</StatusBadge>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
