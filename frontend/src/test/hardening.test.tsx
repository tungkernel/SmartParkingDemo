import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { ToastProvider } from '../context/ToastContext';
import { resolveLiveSocketUrl } from '../hooks/useLiveSocket';
import { escapeCsvCell } from '../lib/csv';
import { selectGateCheckInCards } from '../pages/GatePosPage';
import type { CardRecord } from '../types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Security, Gate POS & WebSocket hardening', () => {
  it('escapes CSV formula injection including tabs, CRs, and leading spaces', () => {
    expect(escapeCsvCell('=CMD()')).toBe('"\'=CMD()"');
    expect(escapeCsvCell(' +SUM(A1:A2)')).toBe('"\' +SUM(A1:A2)"');
    expect(escapeCsvCell('\t-1+1')).toBe('"\'\t-1+1"');
    expect(escapeCsvCell('\r@evil')).toBe('"\'\r@evil"');
    expect(escapeCsvCell('29A-"123"')).toBe('"29A-""123"""');
  });

  it('resolves WebSocket URL from VITE_API_BASE_URL or same-origin host', () => {
    expect(resolveLiveSocketUrl('abc+1', 'https://api.ptit.edu.vn')).toBe(
      'wss://api.ptit.edu.vn/ws/live?ticket=abc%2B1',
    );
    expect(resolveLiveSocketUrl('xyz', 'http://127.0.0.1:8000')).toBe(
      'ws://127.0.0.1:8000/ws/live?ticket=xyz',
    );
    expect(resolveLiveSocketUrl('local', '')).toContain('/ws/live?ticket=local');
  });

  it('auto-matches monthly pass holder card and hides other vehicles pass cards from walk-ins', () => {
    const cards: CardRecord[] = [
      { id: 1, maso: 'TX001', trangthai: 1, pass_plate: '29A-123.45', pass_vehicle_type_id: 2 },
      { id: 2, maso: 'TX002', trangthai: 1, pass_plate: '30G-999.99', pass_vehicle_type_id: 3 },
      { id: 3, maso: 'TX003', trangthai: 1, pass_plate: null, pass_vehicle_type_id: null },
    ];

    // Walk-in vehicle sees ONLY walk-in cards (cannot pick another customer's pass card)
    const walkin = selectGateCheckInCards(cards, '29B-555.55');
    expect(walkin.matchedPassCard).toBeNull();
    expect(walkin.checkInCards.map((c) => c.id)).toEqual([3]);
    expect(walkin.walkinCards.map((c) => c.id)).toEqual([3]);

    // Monthly-pass vehicle matches its own card first (case & whitespace insensitive)
    const passHolder = selectGateCheckInCards(cards, ' 29a-123.45 ');
    expect(passHolder.matchedPassCard?.id).toBe(1);
    expect(passHolder.checkInCards.map((c) => c.id)).toEqual([1, 3]);
  });

  it('validates and submits password changes via ChangePasswordModal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onPasswordChanged = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(
      <ToastProvider>
        <ChangePasswordModal
          open
          onClose={onClose}
          onPasswordChanged={onPasswordChanged}
        />
      </ToastProvider>,
    );

    await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'OldPass123');
    await user.type(screen.getByLabelText('Mật khẩu mới (tối thiểu 8 ký tự)'), 'NewPass123!');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'Different123!');
    await user.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Mật khẩu xác nhận không khớp');
    expect(fetchSpy).not.toHaveBeenCalled();

    const confirmInput = screen.getByLabelText('Nhập lại mật khẩu mới');
    await user.clear(confirmInput);
    await user.type(confirmInput, 'NewPass123!');
    await user.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(onPasswordChanged).toHaveBeenCalledTimes(1);
    });
  });
});
