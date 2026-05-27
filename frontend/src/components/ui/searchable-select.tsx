'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Option {
    key: string;
    label: string;
}

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    placeholder: string;
    label?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
}

export function SearchableSelect({
    value,
    onChange,
    options,
    placeholder,
    label,
    disabled = false,
    required = false,
    className,
}: SearchableSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    const handleSearchInputRef = useCallback((node: HTMLInputElement | null) => {
        searchInputRef.current = node;

        if (node && open) {
            node.focus({ preventScroll: true });
        }
    }, [open]);

    const filteredOptions = useMemo(() => {
        if (!search) return options;
        const normalizedSearch = search.toLowerCase();
        return options.filter((opt) =>
            opt.label.toLowerCase().includes(normalizedSearch)
        );
    }, [options, search]);

    const selectedOption = options.find((o) => o.key === value);

    return (
        <div className={cn("space-y-2 w-full", className)}>
            {label && (
                <label className="text-sm font-semibold text-foreground px-1 flex items-center gap-1">
                    {label}
                    {required && <span className="text-rose-500">*</span>}
                </label>
            )}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger
                    type="button"
                    disabled={disabled}
                    className={cn(
                        "flex h-12 w-full items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-2 text-sm ring-offset-background transition-all hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50",
                        !value && "text-muted-foreground"
                    )}
                >
                    <span className="truncate">
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground opacity-50 transition-transform", open && "rotate-180")} />
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    initialFocus={false}
                    sideOffset={6}
                    className="w-[var(--base-ui-popover-trigger-width)] p-0 bg-popover border border-border rounded-xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200"
                >
                    <div className="flex items-center border-b border-border p-3 gap-2 bg-muted/20">
                        <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                        <input
                            ref={handleSearchInputRef}
                            className="flex h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
                            placeholder="Type to search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSearch(''); }}
                                className="p-1 hover:bg-muted rounded-full transition-colors"
                            >
                                <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                    <div className="max-h-[280px] overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                        {filteredOptions.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground italic">
                                No results found
                            </div>
                        ) : (
                            filteredOptions.map((option, index) => (
                                <button
                                    key={`${option.key}-${index}`}
                                    type="button"
                                    onClick={() => {
                                        onChange(option.key);
                                        setOpen(false);
                                        setSearch('');
                                    }}
                                    className={cn(
                                        "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2.5 pl-3 pr-8 text-sm outline-none transition-colors hover:bg-muted active:scale-[0.98]",
                                        value === option.key && "bg-primary/10 text-primary font-bold"
                                    )}
                                >
                                    <span className="truncate">{option.label}</span>
                                    {value === option.key && (
                                        <Check className="absolute right-2 h-4 w-4 shrink-0" />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
