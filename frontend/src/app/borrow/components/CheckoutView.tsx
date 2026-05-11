'use client';

import { useState } from 'react';
import { CartItem } from '../lib/types';
import { formatCategoryLabel } from '../lib/utils';
import {
  ArrowLeft,
  Package2,
  Building2,
  MapPin,
  CalendarClock,
  Users,
  StickyNote,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Hash,
  Send,
  ClipboardList,
  ChevronDown,
} from 'lucide-react';

interface CheckoutViewProps {
  cart: CartItem[];
  totalCartItems: number;
  categoryLabels: Record<string, string>;
  classificationLabels: Record<string, string>;
  employeeId: string;
  onEmployeeIdChange: (v: string) => void;
  employeePin: string;
  customerName: string;
  onCustomerNameChange: (v: string) => void;
  locationName: string;
  onLocationNameChange: (v: string) => void;
  dueDate: string;
  onDueDateChange: (v: string) => void;
  collaborators: string;
  onCollaboratorsChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  success: boolean;
  submittedByEmployeeName: string | null;
  onOpenPinModal: () => void;
}

export function CheckoutView({
  cart,
  totalCartItems,
  categoryLabels,
  classificationLabels,
  employeeId,
  onEmployeeIdChange,
  employeePin,
  customerName,
  onCustomerNameChange,
  locationName,
  onLocationNameChange,
  dueDate,
  onDueDateChange,
  collaborators,
  onCollaboratorsChange,
  notes,
  onNotesChange,
  onBack,
  onSubmit,
  isSubmitting,
  success,
  submittedByEmployeeName,
  onOpenPinModal,
}: CheckoutViewProps) {
  const isPinVerified = Boolean(employeePin.trim());
  const requiresDueDate = cart.length > 0 && cart.every((item) => item.is_trackable);
  const isFormValid =
    cart.length > 0 &&
    employeeId.trim() &&
    employeePin.trim() &&
    customerName.trim() &&
    locationName.trim() &&
    (!requiresDueDate || dueDate.trim());

  const [itemsExpanded, setItemsExpanded] = useState(false);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 lg:h-[calc(100vh-2rem)] max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* ---- Order Summary ---- */}
      <div className="flex-1 flex flex-col pt-2 lg:pt-4 min-w-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all mb-4 lg:mb-6 self-start px-2 lg:px-3 py-1.5 lg:py-2 -ml-2 lg:-ml-3 rounded-lg hover:bg-muted/50 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Selection
        </button>

        <div>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-2 lg:mb-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] lg:text-xs font-semibold text-primary bg-primary/10 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full">
              <ClipboardList className="w-3 h-3" />
              Step 2 of 2
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mb-1 lg:mb-2">Review Request</h1>
          <p className="text-sm lg:text-base text-muted-foreground">
            Review your items and fill out the details below.
          </p>
        </div>

        {/* Items section — collapsible on mobile, always visible on desktop */}
        <div className="mt-5 lg:mt-8 flex-1 lg:overflow-y-auto lg:pr-2 pb-4 lg:pb-10">
          {/* Mobile: collapsible header */}
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
                  {cart.length} {cart[0]?.is_trackable ? 'equipment' : 'material'}{cart.length !== 1 ? 's' : ''} · {totalCartItems} total qty
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

          {/* Desktop: always visible header */}
          <div className="hidden lg:flex items-center justify-between px-1 mb-5">
            <h2 className="text-lg font-semibold">Items Requested</h2>
            <span className="text-sm font-semibold px-3 py-1.5 bg-primary/10 text-primary rounded-full">
              {totalCartItems} Total
            </span>
          </div>

          {/* Items list */}
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
                    {' '}&middot; {item.available_qty} Remaining
                  </p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <p className="text-[10px] lg:text-xs text-muted-foreground font-medium uppercase tracking-wider">Qty</p>
                  <p className="font-bold text-lg lg:text-xl tabular-nums">{item.cartQty}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- Request Form ---- */}
      <div className="w-full lg:w-[480px] shrink-0 lg:pt-4 pb-4 lg:pb-10">
        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden flex flex-col lg:h-full">
          <div className="p-4 lg:p-6 border-b bg-muted/20">
            <h2 className="text-lg lg:text-xl font-bold">Request Details</h2>
            <p className="text-xs lg:text-sm text-muted-foreground mt-1">Enter your employee info and customer details.</p>
          </div>

          <div className="flex-1 lg:overflow-y-auto p-4 lg:p-6 space-y-5 lg:space-y-7">
            {/* Employee Information */}
            <div className="space-y-3 lg:space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <h3 className="text-xs lg:text-sm font-semibold text-foreground uppercase tracking-wider">Employee Information</h3>
              </div>

              <div className="space-y-2.5 lg:space-y-3">
                <div className="relative group">
                  <Hash className="absolute left-3 lg:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    placeholder="Employee ID"
                    value={employeeId}
                    onChange={(e) => onEmployeeIdChange(e.target.value)}
                    autoFocus
                    className="w-full h-11 lg:h-12 pl-9 lg:pl-10 pr-4 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>

                <button
                  type="button"
                  onClick={onOpenPinModal}
                  className={`w-full h-11 lg:h-12 rounded-xl border flex items-center justify-center gap-2.5 text-sm font-medium transition-all duration-200 ${employeePin
                    ? 'bg-primary/5 text-primary border-primary/20 shadow-sm shadow-primary/10 dark:shadow-none'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.98]'
                    }`}
                >
                  {employeePin ? (
                    <>
                      <CheckCircle2 className="w-4.5 h-4.5" />
                      <span>PIN Verified</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4.5 h-4.5" />
                      <span>Enter Security PIN</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="h-px bg-border/50 w-full" />

            {/* Customer Details */}
            <div className={`space-y-3 lg:space-y-4 transition-all duration-300 ${isPinVerified ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <h3 className="text-xs lg:text-sm font-semibold text-foreground uppercase tracking-wider">Deployment Details</h3>
              </div>

              <div className="space-y-2.5 lg:space-y-3">
                <div className="relative group">
                  <Building2 className="absolute left-3 lg:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    placeholder="Customer / Account Name"
                    value={customerName}
                    onChange={(e) => onCustomerNameChange(e.target.value)}
                    disabled={!isPinVerified}
                    className="w-full h-11 lg:h-12 pl-9 lg:pl-10 pr-4 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-muted disabled:opacity-60"
                  />
                </div>

                <div className="relative group">
                  <MapPin className="absolute left-3 lg:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    placeholder="Location / Site"
                    value={locationName}
                    onChange={(e) => onLocationNameChange(e.target.value)}
                    disabled={!isPinVerified}
                    className="w-full h-11 lg:h-12 pl-9 lg:pl-10 pr-4 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-muted disabled:opacity-60"
                  />
                </div>

                <div className="relative group">
                  <Users className="absolute left-3 lg:left-3.5 top-3 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <textarea
                    placeholder="Team Members (Optional)"
                    value={collaborators}
                    onChange={(e) => onCollaboratorsChange(e.target.value)}
                    disabled={!isPinVerified}
                    className="w-full min-h-[72px] lg:min-h-[90px] pl-9 lg:pl-10 pr-4 py-3 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none disabled:bg-muted disabled:opacity-60"
                  />
                </div>

                {requiresDueDate && (
                  <div className="relative group">
                    <CalendarClock className="absolute left-3 lg:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <input
                      type="datetime-local"
                      value={dueDate}
                      onChange={(e) => onDueDateChange(e.target.value)}
                      disabled={!isPinVerified}
                      className="w-full h-11 lg:h-12 pl-9 lg:pl-10 pr-4 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-muted disabled:opacity-60"
                    />
                  </div>
                )}

                <div className="relative group">
                  <StickyNote className="absolute left-3 lg:left-3.5 top-3 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <textarea
                    placeholder="Notes (Optional)"
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    disabled={!isPinVerified}
                    className="w-full min-h-[72px] lg:min-h-[90px] pl-9 lg:pl-10 pr-4 py-3 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none disabled:bg-muted disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Submit — sticky on mobile */}
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

      {/* Success Overlay */}
      {success && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-50 animate-in fade-in duration-300 p-6">
          <div className="bg-card border rounded-2xl shadow-2xl p-8 lg:p-10 max-w-sm w-full text-center flex flex-col items-center animate-in zoom-in-95 duration-500">
            {/* Animated success ring */}
            <div className="relative mb-6 lg:mb-8">
              <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 lg:w-10 lg:h-10 text-emerald-600 dark:text-emerald-400 animate-in zoom-in-50 duration-500" />
              </div>
              <div className="absolute inset-0 w-16 h-16 lg:w-20 lg:h-20 rounded-full border-2 border-emerald-400/40 animate-ping" />
            </div>

            <h3 className="text-xl lg:text-2xl font-bold mb-2">Request Submitted</h3>
            <p className="text-muted-foreground text-sm mb-6 lg:mb-8 leading-relaxed">
              Your borrow request was successfully processed by{' '}
              <strong className="text-foreground">{submittedByEmployeeName ?? employeeId}</strong>.
            </p>
            <button
              className="w-full h-11 lg:h-12 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-medium transition-all active:scale-[0.98]"
              onClick={() => window.location.reload()}
            >
              Start New Request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
