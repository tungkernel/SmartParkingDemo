import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn';

interface LicensePlateProps {
  plate: string | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  copyable?: boolean;
  className?: string;
}

const SIZE_CLS = {
  xs: 'px-1.5 py-0.5 text-[11px] rounded-md',
  sm: 'px-2 py-0.5 text-xs rounded-md',
  md: 'px-2.5 py-1 text-[13px] rounded-lg',
  lg: 'px-3.5 py-1.5 text-base rounded-lg',
};

/** Vietnamese reflective license-plate badge with crisp tabular mono typography. */
export function LicensePlate({
  plate,
  size = 'sm',
  copyable = false,
  className,
}: LicensePlateProps) {
  const [copied, setCopied] = useState(false);

  if (!plate) {
    return <span className="text-slate-400 dark:text-slate-500">—</span>;
  }

  const handleCopy = () => {
    if (!copyable || !navigator.clipboard) return;
    void navigator.clipboard.writeText(plate).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  const baseCls = cn(
    'font-mono-plate inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 font-bold uppercase tracking-wider select-all',
    'bg-[#FCFBF7] text-slate-900 border-[1.5px] border-[#292622]/85 shadow-[inset_0_0_0_1px_rgba(255,253,248,0.85),0_1px_2px_rgba(31,29,26,0.08)]',
    'dark:bg-slate-100 dark:text-slate-950 dark:border-slate-400/90',
    SIZE_CLS[size],
    copyable && 'cursor-pointer hover:border-brand-600 transition-colors group',
    className,
  );

  if (copyable) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Đã sao chép biển số' : `Nhấn để sao chép ${plate}`}
        className={baseCls}
      >
        <span>{plate}</span>
        {copied ? (
          <Check className="h-3 w-3 text-emerald-600 shrink-0" />
        ) : (
          <Copy className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        )}
      </button>
    );
  }

  return <span className={baseCls}>{plate}</span>;
}
