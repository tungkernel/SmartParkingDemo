import { Bike, CarFront, Truck, Zap } from 'lucide-react';

interface VehicleIconProps {
  vehicleType?: string | null;
  className?: string;
}

export function VehicleIcon({ vehicleType, className = 'h-4 w-4' }: VehicleIconProps) {
  const normalized = (vehicleType ?? '').toLowerCase();
  if (normalized.includes('điện') || normalized.includes('dien')) {
    return <Zap className={className} aria-hidden="true" />;
  }
  if (
    normalized.includes('máy') ||
    normalized.includes('may') ||
    normalized.includes('đạp') ||
    normalized.includes('dap') ||
    normalized.includes('moto')
  ) {
    return <Bike className={className} aria-hidden="true" />;
  }
  if (normalized.includes('tải') || normalized.includes('tai') || normalized.includes('truck')) {
    return <Truck className={className} aria-hidden="true" />;
  }
  return <CarFront className={className} aria-hidden="true" />;
}
