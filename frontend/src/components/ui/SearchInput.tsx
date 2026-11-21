import { Search, X } from 'lucide-react';
import type { InputHTMLAttributes, RefObject } from 'react';
import { cn } from '../../lib/cn';

interface SearchInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> {
  inputRef?: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  shortcutHint?: string;
  containerClassName?: string;
}

export function SearchInput({
  inputRef,
  value,
  onChange,
  shortcutHint,
  containerClassName,
  className,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn('relative', containerClassName)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded-xl border border-slate-200 dark:border-slate-700/90 bg-slate-50/90 dark:bg-slate-800/80 pl-9 py-2 text-xs sm:text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:bg-surface-input dark:focus:bg-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all',
          value || shortcutHint ? 'pr-14' : 'pr-3',
          className,
        )}
        {...props}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {value && (
          <button
            type="button"
            aria-label="Xóa từ khóa tìm kiếm"
            onClick={() => onChange('')}
            className="rounded-md p-0.5 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {!value && shortcutHint && (
          <kbd className="kbd-keycap pointer-events-none">{shortcutHint}</kbd>
        )}
      </div>
    </div>
  );
}
