import type { CatalogEmployee } from '../types';

export type PreferredEmployeeRole = 'guard' | 'cashier';

const ROLE_KEYWORD: Record<PreferredEmployeeRole, string> = {
  guard: 'bảo vệ',
  cashier: 'thu ngân',
};

export function pickDefaultEmployeeId(
  employees: CatalogEmployee[],
  options: { lotId?: number | '' | null; preferredRole: PreferredEmployeeRole },
): number | '' {
  if (employees.length === 0) return '';
  const targetRole = ROLE_KEYWORD[options.preferredRole];
  const lotNum =
    options.lotId !== '' && options.lotId !== null && options.lotId !== undefined
      ? Number(options.lotId)
      : null;

  if (lotNum !== null && !Number.isNaN(lotNum)) {
    const exact = employees.find(
      (emp) => emp.idbdx === lotNum && emp.chucvu.toLowerCase().includes(targetRole),
    );
    if (exact) return exact.id;
  }

  const byRole = employees.find((emp) => emp.chucvu.toLowerCase().includes(targetRole));
  if (byRole) return byRole.id;

  const manager = employees.find((emp) => emp.chucvu.toLowerCase().includes('quản lý'));
  if (manager) return manager.id;

  return employees[0]?.id ?? '';
}

export function formatEmployeeOption(emp: CatalogEmployee): string {
  return `${emp.hoten} — ${emp.chucvu}${emp.tenbaido ? ` (${emp.tenbaido})` : ''}`;
}
