import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLiveSocketUrl } from '../hooks/useLiveSocket';
import { escapeCsvCell } from '../lib/csv';
import { formatEmployeeOption, pickDefaultEmployeeId } from '../lib/employee';
import { selectGateCheckInCards } from '../pages/GatePosPage';
import type { CardRecord, CatalogEmployee } from '../types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Gate POS, Employee Attribution & WebSocket utilities', () => {
  it('escapes CSV formula injection including tabs, CRs, and leading spaces', () => {
    expect(escapeCsvCell('=CMD()')).toBe('"\'=CMD()"');
    expect(escapeCsvCell(' +SUM(A1:A2)')).toBe('"\' +SUM(A1:A2)"');
    expect(escapeCsvCell('\t-1+1')).toBe('"\'\t-1+1"');
    expect(escapeCsvCell('\r@evil')).toBe('"\'\r@evil"');
    expect(escapeCsvCell('29A-"123"')).toBe('"29A-""123"""');
  });

  it('resolves direct WebSocket URL from VITE_API_BASE_URL or same-origin host without ticket', () => {
    expect(resolveLiveSocketUrl('https://api.ptit.edu.vn')).toBe('wss://api.ptit.edu.vn/ws/live');
    expect(resolveLiveSocketUrl('http://127.0.0.1:8000')).toBe('ws://127.0.0.1:8000/ws/live');
    expect(resolveLiveSocketUrl('')).toMatch(/\/ws\/live$/);
  });

  it('auto-matches monthly pass holder card and hides other vehicles pass cards from walk-ins', () => {
    const cards: CardRecord[] = [
      { id: 1, maso: 'TX001', trangthai: 1, pass_plate: '29A-123.45', pass_vehicle_type_id: 2 },
      { id: 2, maso: 'TX002', trangthai: 1, pass_plate: '30G-999.99', pass_vehicle_type_id: 3 },
      { id: 3, maso: 'TX003', trangthai: 1, pass_plate: null, pass_vehicle_type_id: null },
    ];

    const walkin = selectGateCheckInCards(cards, '29B-555.55');
    expect(walkin.matchedPassCard).toBeNull();
    expect(walkin.checkInCards.map((c) => c.id)).toEqual([3]);
    expect(walkin.walkinCards.map((c) => c.id)).toEqual([3]);

    const passHolder = selectGateCheckInCards(cards, ' 29a-123.45 ');
    expect(passHolder.matchedPassCard?.id).toBe(1);
    expect(passHolder.checkInCards.map((c) => c.id)).toEqual([1, 3]);
  });

  it('picks lot-matched guard or cashier and falls back cleanly', () => {
    const employees: CatalogEmployee[] = [
      {
        id: 3,
        hoten: 'Lê Minh Cường',
        chucvu: 'Quản lý',
        sdt: '0912',
        idbdx: 3,
        tenbaido: 'Bãi xe đạp',
      },
      {
        id: 1001,
        hoten: 'Nguyễn Văn An',
        chucvu: 'Bảo vệ',
        sdt: '0912',
        idbdx: 1,
        tenbaido: 'Bãi ô tô',
      },
      {
        id: 1002,
        hoten: 'Trần Quốc Bảo',
        chucvu: 'Bảo vệ',
        sdt: '0912',
        idbdx: 2,
        tenbaido: 'Bãi xe máy',
      },
      {
        id: 2001,
        hoten: 'Trần Thị Bình',
        chucvu: 'Thu ngân',
        sdt: '0912',
        idbdx: 1,
        tenbaido: 'Bãi ô tô',
      },
      {
        id: 2002,
        hoten: 'Lê Thu Hà',
        chucvu: 'Thu ngân',
        sdt: '0912',
        idbdx: 2,
        tenbaido: 'Bãi xe máy',
      },
    ];

    expect(pickDefaultEmployeeId(employees, { lotId: 2, preferredRole: 'guard' })).toBe(1002);
    expect(pickDefaultEmployeeId(employees, { lotId: 2, preferredRole: 'cashier' })).toBe(2002);
    expect(pickDefaultEmployeeId(employees, { lotId: 99, preferredRole: 'cashier' })).toBe(2001);
    expect(pickDefaultEmployeeId([employees[0]!], { lotId: 1, preferredRole: 'guard' })).toBe(3);
    expect(pickDefaultEmployeeId([], { lotId: 1, preferredRole: 'guard' })).toBe('');
    expect(formatEmployeeOption(employees[1]!)).toBe('Nguyễn Văn An — Bảo vệ (Bãi ô tô)');
  });
});
