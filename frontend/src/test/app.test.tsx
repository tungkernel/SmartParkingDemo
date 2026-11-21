import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../components/ui/Modal';
import { StatusBadge, paymentStatusTone } from '../components/ui/StatusBadge';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { AuthProvider } from '../context/AuthContext';
import App from '../App';

function renderWithProviders(initialPath = '/login') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={[initialPath]}>
              <App />
            </MemoryRouter>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('Smart Parking SPA UI primitives & routing', () => {
  it('redirects unauthenticated users from protected routes to /login', () => {
    renderWithProviders('/analytics');
    expect(screen.getByRole('heading', { name: /đăng nhập hệ thống/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/tên đăng nhập/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mật khẩu/i)).toBeInTheDocument();
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
