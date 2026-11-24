import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PeopleTab } from '../components/admin/PeopleTab';
import { ActiveTurnsTable } from '../components/gate/ActiveTurnsTable';
import { CheckoutModal } from '../components/gate/CheckoutModal';
import { QuickSlotPicker } from '../components/gate/QuickSlotPicker';
import { TariffMatrix } from '../components/passes/TariffMatrix';
import { LicensePlate } from '../components/ui/LicensePlate';
import { Modal } from '../components/ui/Modal';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { formatElapsedDuration, getDaysRemaining, getHoursParked } from '../lib/time';
import { findMatchingLotForVehicleType } from '../pages/GatePosPage';
import type {
  ActiveTurn,
  CatalogEmployee,
  FeeQuote,
  ParkingLot,
  ParkingSlot,
  Tariff,
} from '../types';

afterEach(() => {
  vi.restoreAllMocks();
});

function AccentProbe() {
  const { accent, setAccent } = useTheme();
  return (
    <div>
      <span data-testid="accent-val">{accent}</span>
      <button type="button" onClick={() => setAccent('crimson')}>
        Set Crimson
      </button>
    </div>
  );
}

function ThemeModeProbe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-val">{theme}</span>
      <button type="button" onClick={toggleTheme}>
        Toggle Theme
      </button>
    </div>
  );
}

function renderWithQueryAndToast(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('UI/UX upgrade primitives & workflows', () => {
  it('computes elapsed parking durations and remaining pass days accurately', () => {
    const baseNow = new Date('2026-11-22T10:00:00Z').getTime();
    expect(formatElapsedDuration('2026-11-22 09:59:30', baseNow)).toBe('< 1p');
    expect(formatElapsedDuration('2026-11-22 09:15:00', baseNow)).toBe('45p');
    expect(formatElapsedDuration('2026-11-22 06:40:00', baseNow)).toBe('3g 20p');
    expect(formatElapsedDuration('2026-11-20 06:00:00', baseNow)).toBe('2n 4g');
    expect(getHoursParked('2026-11-21 08:00:00', baseNow)).toBe(26);

    const passNow = new Date('2026-11-20T12:00:00+07:00').getTime();
    expect(getDaysRemaining('2026-11-25', passNow)).toBe(6);
  });

  it('persists personal accent theme to document root and localStorage', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <AccentProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('accent-val')).toHaveTextContent('cobalt');
    expect(document.documentElement.getAttribute('data-accent')).toBe('cobalt');

    await user.click(screen.getByRole('button', { name: 'Set Crimson' }));
    expect(screen.getByTestId('accent-val')).toHaveTextContent('crimson');
    expect(document.documentElement.getAttribute('data-accent')).toBe('crimson');
  });

  it('renders LicensePlate badge and fallback dash when empty', () => {
    const { rerender } = render(<LicensePlate plate="29A-888.99" />);
    expect(screen.getByText('29A-888.99')).toBeInTheDocument();

    rerender(<LicensePlate plate={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('locks body scroll when Modal is open and restores on unmount', () => {
    const { unmount } = render(
      <Modal open onClose={vi.fn()} title="Test Scroll Lock">
        <div>Nội dung</div>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('calculates cash change immediately in CheckoutModal with employee selector', async () => {
    const user = userEvent.setup();
    const turn: ActiveTurn = {
      id_luotdo: 101,
      bienso: '29A-123.45',
      loaiphuongtien: 'xe máy',
      chu_xe: 'Khách vãng lai',
      tenbaido: 'Bãi A',
      khuvuc: 'A',
      vitri: 1,
      mathe: '001',
      giovao: '2026-11-22 08:00:00',
      nhanvien: 'Bảo vệ A',
      loaive: 'ngày',
      dongia: 5000,
    };
    const quote: FeeQuote = {
      turn_id: 101,
      license_plate: '29A-123.45',
      vehicle_type: 'xe máy',
      ticket_type: 'Vé ngày',
      checkin_time: '2026-11-22 08:00:00',
      checkout_time: '2026-11-22 10:00:00',
      duration_hours: 2,
      amount: 5000,
      is_monthly_pass: false,
      monthly_pass_id: null,
    };
    const employees: CatalogEmployee[] = [
      {
        id: 2001,
        hoten: 'Trần Thị Bình',
        chucvu: 'Thu ngân',
        sdt: '0912',
        idbdx: 1,
        tenbaido: 'Bãi A',
      },
    ];

    render(
      <CheckoutModal
        turn={turn}
        quote={quote}
        loadingQuote={false}
        paymentMethod="Tiền mặt"
        onPaymentMethodChange={vi.fn()}
        lostCard={false}
        onLostCardChange={vi.fn()}
        lostCardFee={50000}
        onLostCardFeeChange={vi.fn()}
        replacementCardId=""
        onReplacementCardChange={vi.fn()}
        availableCards={[]}
        employees={employees}
        employeeId={2001}
        onEmployeeChange={vi.fn()}
        submitting={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Nhân viên thu ngân/i)).toHaveValue('2001');
    await user.click(screen.getByRole('button', { name: '50k' }));
    expect(screen.getByText(/45\.000 đ/)).toBeInTheDocument();
  });

  it('renders TariffMatrix edit and delete actions according to permissions', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const tariffs: Tariff[] = [
      {
        id: 11,
        loaive: 'ngày',
        dongia: 5000,
        loaiphuongtien: 'xe máy',
        loaikhachhang: 'Vãng lai',
        idlpt: 1,
        idlkh: null,
      },
    ];

    const { rerender } = render(
      <TariffMatrix
        tariffs={tariffs}
        canManage
        canDelete
        onEditTariff={onEdit}
        onDeleteTariff={onDelete}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Sửa giá/i }));
    expect(onEdit).toHaveBeenCalledWith(tariffs[0]);

    await user.click(screen.getByRole('button', { name: 'Xóa biểu giá #11' }));
    expect(onDelete).toHaveBeenCalledWith(tariffs[0]);

    rerender(
      <TariffMatrix
        tariffs={tariffs}
        canManage={false}
        canDelete={false}
        onEditTariff={onEdit}
        onDeleteTariff={onDelete}
      />,
    );
    expect(screen.queryByRole('button', { name: /Sửa giá/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa biểu giá #11' })).not.toBeInTheDocument();
  });

  it('submits new employee via PeopleTab with null optional dates', async () => {
    const user = userEvent.setup();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/catalogs')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              vehicle_types: [{ id: 1, tenloai: 'xe máy' }],
              customer_types: [{ id: 1, tenloai: 'Sinh viên' }],
              lots: [
                {
                  id: 1,
                  tenbaido: 'Bãi A',
                  diadiem: 'Cổng chính',
                  tong_cho: 20,
                  cho_trong: 10,
                  dang_do: 10,
                  bao_tri: 0,
                },
              ],
              employees: [],
              vietqr: { bank_bin: '970422', account_no: '0123456789', account_name: 'PTIT' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (url.includes('/api/v1/people/employees') && init?.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 99 }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    renderWithQueryAndToast(<PeopleTab />);

    const addBtn = await screen.findByRole('button', { name: 'Thêm nhân viên' });
    await user.click(addBtn);

    await user.type(screen.getByLabelText('Họ và tên'), 'Lê Minh Khôi');
    await user.clear(screen.getByLabelText('Chức vụ'));
    await user.type(screen.getByLabelText('Chức vụ'), 'Thu ngân');
    await user.type(screen.getByLabelText('Số điện thoại'), '0987654321');

    const submitButtons = screen.getAllByRole('button', { name: 'Thêm nhân viên' });
    const modalSubmit = submitButtons[submitButtons.length - 1];
    expect(modalSubmit).toBeDefined();
    await user.click(modalSubmit!);

    await waitFor(() => {
      const postCall = fetchSpy.mock.calls.find(
        ([u, init]) => String(u).includes('/api/v1/people/employees') && init?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
        hoten: 'Lê Minh Khôi',
        chucvu: 'Thu ngân',
        sdt: '0987654321',
        birth_date: null,
        start_date: null,
      });
    });
  });

  it('renders ActiveTurnsTable inside an internal scroll-pane with sticky header and single-line actions', () => {
    const searchRef = createRef<HTMLInputElement>();
    const turns: ActiveTurn[] = [
      {
        id_luotdo: 12,
        bienso: 'XD0003',
        loaiphuongtien: 'xe đạp',
        chu_xe: 'Khách vãng lai',
        tenbaido: 'Bãi đỗ xe đạp',
        khuvuc: 'A',
        vitri: 6,
        mathe: '012',
        giovao: '2026-11-19 06:26:00',
        nhanvien: 'Bảo vệ A',
        loaive: 'ngày',
        dongia: 3000,
      },
      {
        id_luotdo: 11,
        bienso: '29H33456',
        loaiphuongtien: 'xe máy',
        chu_xe: 'Nguyễn Minh Khôi',
        tenbaido: 'Bãi đỗ xe máy',
        khuvuc: 'C',
        vitri: 1,
        mathe: '009',
        giovao: '2026-11-19 06:26:00',
        nhanvien: 'Bảo vệ A',
        loaive: 'tháng',
        dongia: 0,
      },
    ];

    const { container } = render(
      <ActiveTurnsTable
        searchInputRef={searchRef}
        search=""
        onSearchChange={vi.fn()}
        quickFilter="all"
        onQuickFilterChange={vi.fn()}
        counts={{ all: 5, daily: 3, monthly: 2, overdue: 2 }}
        turns={turns}
        totalCount={5}
        loading={false}
        canManageTurns
        busyTurnId={null}
        onOpenCheckout={vi.fn()}
        onOpenMoveSlot={vi.fn()}
        onRequestCancel={vi.fn()}
        onPrintTicket={vi.fn()}
      />,
    );

    const scrollPane = container.querySelector('.scroll-pane');
    expect(scrollPane).not.toBeNull();
    expect(scrollPane?.querySelector('thead.table-sticky-head')).not.toBeNull();

    const checkoutButtons = screen.getAllByRole('button', { name: /Check-out/i });
    expect(checkoutButtons[0]).toHaveClass('whitespace-nowrap');

    expect(
      screen.getByText((_, node) => node?.textContent === 'Hiển thị 2 / 5 xe'),
    ).toBeInTheDocument();
  });

  it('defaults ThemeProvider to light mode when no saved theme exists and toggles to dark explicitly', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('smart_parking_theme');
    document.documentElement.classList.remove('dark');

    render(
      <ThemeProvider>
        <ThemeModeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme-val')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Toggle Theme' }));
    expect(screen.getByTestId('theme-val')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('smart_parking_theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Toggle Theme' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    localStorage.removeItem('smart_parking_theme');
  });

  it('matches vehicle types to corresponding parking lots accurately', () => {
    const lots: ParkingLot[] = [
      {
        id: 1,
        tenbaido: 'Bãi đỗ xe đạp',
        diadiem: 'Khu A',
        tong_cho: 30,
        cho_trong: 27,
        dang_do: 3,
        bao_tri: 0,
      },
      {
        id: 2,
        tenbaido: 'Bãi đỗ xe máy',
        diadiem: 'Khu B',
        tong_cho: 50,
        cho_trong: 40,
        dang_do: 10,
        bao_tri: 0,
      },
      {
        id: 3,
        tenbaido: 'Bãi đỗ ô tô',
        diadiem: 'Khu C',
        tong_cho: 20,
        cho_trong: 15,
        dang_do: 5,
        bao_tri: 0,
      },
    ];

    expect(findMatchingLotForVehicleType(lots, 'Xe Đạp')?.id).toBe(1);
    expect(findMatchingLotForVehicleType(lots, 'xe máy')?.id).toBe(2);
    expect(findMatchingLotForVehicleType(lots, 'Ô Tô')?.id).toBe(3);
    expect(findMatchingLotForVehicleType(lots, 'xe tải')).toBeNull();
    expect(findMatchingLotForVehicleType(lots, undefined)).toBeNull();
  });

  it('shows slots across all parking lots in QuickSlotPicker, filters by lot tab, and passes selected lotId', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const lots: ParkingLot[] = [
      {
        id: 1,
        tenbaido: 'Bãi đỗ xe đạp',
        diadiem: 'Cổng chính',
        tong_cho: 10,
        cho_trong: 1,
        dang_do: 9,
        bao_tri: 0,
      },
      {
        id: 2,
        tenbaido: 'Bãi đỗ xe máy',
        diadiem: 'Nhà B',
        tong_cho: 10,
        cho_trong: 1,
        dang_do: 9,
        bao_tri: 0,
      },
      {
        id: 3,
        tenbaido: 'Bãi đỗ ô tô',
        diadiem: 'Sân sau',
        tong_cho: 10,
        cho_trong: 1,
        dang_do: 9,
        bao_tri: 0,
      },
    ];

    const allSlots: ParkingSlot[] = [
      {
        id: 101,
        idkvd: 1,
        sothutu: 4,
        trangthai: 1,
        ten_khuvuc: 'A',
        idbdx: 1,
        tenbaido: 'Bãi đỗ xe đạp',
        bienso: null,
        giovao: null,
        loaiphuongtien: null,
      },
      {
        id: 201,
        idkvd: 4,
        sothutu: 5,
        trangthai: 1,
        ten_khuvuc: 'M',
        idbdx: 2,
        tenbaido: 'Bãi đỗ xe máy',
        bienso: null,
        giovao: null,
        loaiphuongtien: null,
      },
      {
        id: 301,
        idkvd: 7,
        sothutu: 2,
        trangthai: 1,
        ten_khuvuc: 'O',
        idbdx: 3,
        tenbaido: 'Bãi đỗ ô tô',
        bienso: null,
        giovao: null,
        loaiphuongtien: null,
      },
    ];

    render(
      <QuickSlotPicker
        open
        lots={lots}
        allSlots={allSlots}
        activeLotId={1}
        selectedSlotId={101}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('Chọn vị trí trống — Tất cả bãi đỗ')).toBeInTheDocument();
    expect(screen.getByText('A-4')).toBeInTheDocument();
    expect(screen.getByText('M-5')).toBeInTheDocument();
    expect(screen.getByText('O-2')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Bãi đỗ ô tô/i }));
    expect(screen.getByText('Chọn vị trí trống — Bãi đỗ ô tô')).toBeInTheDocument();
    expect(screen.queryByText('A-4')).not.toBeInTheDocument();
    expect(screen.getByText('O-2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /O-2/i }));
    expect(onSelect).toHaveBeenCalledWith(301, 3);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
