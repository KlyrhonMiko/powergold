'use client';

import { useState } from 'react';
import { ArrowLeft, Building2, CalendarClock, CheckCircle2, ClipboardList, Loader2, MapPin, Package2, Send, StickyNote, ChevronDown } from 'lucide-react';
import { formatCategoryLabel } from '@/app/borrow/lib/utils';
import type { CartItem } from '@/app/borrow/lib/types';
import { formatQuantity, formatQuantityWithUnit } from '@/lib/inventoryQuantity';

interface ConsumableRequestCheckoutProps {
  cart: CartItem[];
  totalCartItems: number;
  categoryLabels: Record<string, string>;
  classificationLabels: Record<string, string>;
  companyName: string;
  onCompanyNameChange: (value: string) => void;
  locationName: string;
  onLocationNameChange: (value: string) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  success: boolean;
  onStartOver: () => void;
}

export function ConsumableRequestCheckout({
  cart,
  totalCartItems,
  categoryLabels,
  classificationLabels,
  companyName,
  onCompanyNameChange,
  locationName,
  onLocationNameChange,
  dueDate,
  onDueDateChange,
  notes,
  onNotesChange,
  onBack,
  onSubmit,
  isSubmitting,
  success,
  onStartOver,
}: ConsumableRequestCheckoutProps) {
  const [itemsExpanded, setItemsExpanded] = useState(false);

  const isFormValid =
    cart.length > 0 &&
    companyName.trim() &&
    locationName.trim() &&
    dueDate.trim();

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 lg:h-[calc(100vh-2rem)] max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex-1 flex flex-col pt-2 lg:pt-4 min-w-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all mb-4 lg:mb-6 self-start px-2 lg:px-3 py-1.5 lg:py-2 -ml-2 lg:-ml-3 rounded-lg hover:bg-muted/50 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Selection
        </button>

        <div>
          <div className="flex items-center gap-2 mb-2 lg:mb-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] lg:text-xs font-semibold text-primary bg-primary/10 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full">
              <ClipboardList className="w-3 h-3" />
              Step 2 of 2
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mb-1 lg:mb-2">Review Request</h1>
          <p className="text-sm lg:text-base text-muted-foreground">
            Review your consumables and fill out the request details below.
          </p>
        </div>

        <div className="mt-5 lg:mt-8 flex-1 lg:overflow-y-auto lg:pr-2 pb-4 lg:pb-10">
          <button
            onClick={() => setItemsExpanded(!itemsExpanded)}
            className="lg:hidden w-full flex items-center justify-between p-3.5 rounded-xl border bg-card mb-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package2 className="w-4 h-4 text-primary/60" />
              </div>
              <div className="text-left">
                <h2 className="text-sm font-semibold">Items Requested</h2>
                <p className="text-[11px] text-muted-foreground">
                  {cart.length} material{cart.length !== 1 ? 's' : ''} · {formatQuantity(totalCartItems)} total qty
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 bg-primary/10 text-primary rounded-full">
                {totalCartItems}
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${itemsExpanded ? 'rotate-180' : ''}`} />
            </div>
          </button>

          <div className="hidden lg:flex items-center justify-between px-1 mb-5">
            <h2 className="text-lg font-semibold">Items Requested</h2>
            <span className="text-sm font-semibold px-3 py-1.5 bg-primary/10 text-primary rounded-full">
              {totalCartItems} Total
            </span>
          </div>

          <div className={`space-y-2 lg:space-y-3 ${itemsExpanded ? 'block' : 'hidden'} lg:block`}>
            {cart.map((item, index) => (
              <div
                key={item.item_id}
                className="flex items-center gap-3 lg:gap-4 p-3 lg:p-4 rounded-xl border bg-card/50 hover:bg-card transition-colors border-l-4 border-l-primary/30"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Package2 className="w-4 h-4 lg:w-5 lg:h-5 text-primary/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{item.name}</p>
                  <p className="text-[11px] lg:text-sm text-muted-foreground mt-0.5">
                    {categoryLabels[item.category] || item.category}
                    {item.classification && (
                      <>
                        {' '}&middot; {classificationLabels[item.classification] || formatCategoryLabel(item.classification)}
                      </>
                    )}
                    {' '}&middot; {formatQuantityWithUnit(item.available_qty, item.unit_of_measure)} Remaining
                  </p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <p className="text-[10px] lg:text-xs text-muted-foreground font-medium uppercase tracking-wider">Qty</p>
                  <p className="font-bold text-lg lg:text-xl tabular-nums">{formatQuantity(item.cartQty)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[480px] shrink-0 lg:pt-4 pb-4 lg:pb-10">
        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden flex flex-col lg:h-full">
          <div className="p-4 lg:p-6 border-b bg-muted/20">
            <h2 className="text-lg lg:text-xl font-bold">Request Details</h2>
            <p className="text-xs lg:text-sm text-muted-foreground mt-1">Enter company, location, date, and notes.</p>
          </div>

          <div className="flex-1 lg:overflow-y-auto p-4 lg:p-6 space-y-5 lg:space-y-7">
            <div className="space-y-3 lg:space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <h3 className="text-xs lg:text-sm font-semibold text-foreground uppercase tracking-wider">Request Information</h3>
              </div>

              <div className="space-y-2.5 lg:space-y-3">
                <div className="relative group">
                  <Building2 className="absolute left-3 lg:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    placeholder="Company Name"
                    value={companyName}
                    onChange={(e) => onCompanyNameChange(e.target.value)}
                    className="w-full h-11 lg:h-12 pl-9 lg:pl-10 pr-4 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>

                <div className="relative group">
                  <MapPin className="absolute left-3 lg:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    placeholder="Location / Site"
                    value={locationName}
                    onChange={(e) => onLocationNameChange(e.target.value)}
                    className="w-full h-11 lg:h-12 pl-9 lg:pl-10 pr-4 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>

                <div className="relative group">
                  <CalendarClock className="absolute left-3 lg:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => onDueDateChange(e.target.value)}
                    className="w-full h-11 lg:h-12 pl-9 lg:pl-10 pr-4 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>

                <div className="relative group">
                  <StickyNote className="absolute left-3 lg:left-3.5 top-3 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <textarea
                    placeholder="Notes (Optional)"
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    className="w-full min-h-[72px] lg:min-h-[90px] pl-9 lg:pl-10 pr-4 py-3 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 lg:p-6 border-t bg-muted/5 mt-auto sticky bottom-0 lg:static">
            <button
              onClick={onSubmit}
              disabled={!isFormValid || isSubmitting}
              className="w-full h-12 lg:h-13 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 active:scale-[0.98] flex items-center justify-center gap-2.5 transition-all duration-200 shadow-md shadow-primary/20 disabled:shadow-none text-sm lg:text-[15px]"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4 lg:w-4.5 lg:h-4.5" />
                  Submit Request
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {success && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-50 animate-in fade-in duration-300 p-6">
          <div className="bg-card border rounded-2xl shadow-2xl p-8 lg:p-10 max-w-sm w-full text-center flex flex-col items-center animate-in zoom-in-95 duration-500">
            <div className="relative mb-6 lg:mb-8">
              <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 lg:w-10 lg:h-10 text-emerald-600 dark:text-emerald-400 animate-in zoom-in-50 duration-500" />
              </div>
              <div className="absolute inset-0 w-16 h-16 lg:w-20 lg:h-20 rounded-full border-2 border-emerald-400/40 animate-ping" />
            </div>

            <h3 className="text-xl lg:text-2xl font-bold mb-2">Request Submitted</h3>
            <p className="text-muted-foreground text-sm mb-6 lg:mb-8 leading-relaxed">
              Your consumables request was successfully submitted.
            </p>
            <button
              className="w-full h-11 lg:h-12 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-medium transition-all active:scale-[0.98]"
              onClick={onStartOver}
            >
              Start New Request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}