'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { ShieldCheck, CheckCircle2, X, Delete, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { posApi, BorrowCatalogItem } from './api';
import { useInventoryWebSocket } from '@/hooks/useInventoryWebSocket';
import type { ConfigRead } from '../inventory/items/api';
import { toast } from 'sonner';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { CartItem } from './lib/types';
import { validateBorrowSubmission, validatePinVerificationInput } from './lib/validation';
import {
  BORROW_KIOSK_ROLE_ERROR,
  BORROW_KIOSK_TWO_FACTOR_ERROR,
  isBorrowerRole,
  isTwoFactorChallengeResponse,
} from './lib/authFlow';
import { SelectionView } from './components/SelectionView';
import { CheckoutView } from './components/CheckoutView';
import { parseQuantityInput } from '@/lib/inventoryQuantity';
import { formatCategoryLabel } from './lib/utils';

interface BorrowerTaxonomyData {
  categories: ConfigRead[];
  classifications: ConfigRead[];
}

type BorrowItemKind = 'trackable' | 'untrackable';

export default function BorrowPage() {
  const queryClient = useQueryClient();
  useInventoryWebSocket();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [employeeId, setEmployeeId] = useState('');
  const [employeePin, setEmployeePin] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [collaborators, setCollaborators] = useState('');
  const [notes, setNotes] = useState('');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isPinVerifying, setIsPinVerifying] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [step, setStep] = useState<'selection' | 'checkout'>('selection');
  const [success, setSuccess] = useState(false);
  const [submittedByEmployeeName, setSubmittedByEmployeeName] = useState<string | null>(null);
  const [selectedItemKind, setSelectedItemKind] = useState<BorrowItemKind | null>(null);

  const { data: items = [], isLoading: isLoadingCatalog } = useQuery({
    queryKey: ['borrow', 'catalog'],
    queryFn: async () => {
      const res = await posApi.listCatalog({ per_page: 200 });
      return res.data;
    },
  });

  const { data: taxonomy } = useQuery({
    queryKey: ['borrow', 'taxonomy'],
    queryFn: async () => {
      const res = await api.get<BorrowerTaxonomyData>('/inventory/borrower/taxonomy');
      return res.data;
    },
    refetchInterval: 300000, // 5 minutes for taxonomy
  });

  const categoryConfigs = taxonomy?.categories || [];
  const classificationConfigs = taxonomy?.classifications || [];
  const loading = isLoadingCatalog;

  const categoryLabels = useMemo(() => {
    return Object.fromEntries(categoryConfigs.map((category) => [category.key, category.value]));
  }, [categoryConfigs]);

  const classificationLabels = useMemo(() => {
    return Object.fromEntries(
      classificationConfigs.map((classification) => [classification.key, classification.value]),
    );
  }, [classificationConfigs]);

  const categories = useMemo(() => {
    const cats = new Set(items.map((i) => i.category).filter(Boolean));
    return ['All', ...Array.from(cats).sort()];
  }, [items]);

  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredItems = useMemo(
    () =>
      items.filter((i) => {
        const matchesKind =
          selectedItemKind === null
            ? false
            : selectedItemKind === 'trackable'
              ? i.is_trackable
              : !i.is_trackable;
        const matchesSearch =
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          i.category.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = selectedCategory === 'All' || i.category === selectedCategory;
        return matchesKind && matchesSearch && matchesCategory;
      }),
    [items, search, selectedCategory, selectedItemKind],
  );

  const totalCartItems = cart.reduce((acc, curr) => acc + curr.cartQty, 0);

  const addToCart = (item: BorrowCatalogItem) => {
    const step = 1;
    setCart((prev) => {
      const existing = prev.find((i) => i.item_id === item.item_id);
      if (existing) {
        return prev.map((i) =>
          i.item_id === item.item_id
            ? { ...i, cartQty: parseQuantityInput(String(i.cartQty + step), step) }
            : i,
        );
      }
      return [...prev, { ...item, cartQty: step }];
    });
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.item_id === id) {
          const step = 1;
          const newQty = parseQuantityInput(String(i.cartQty + delta * step), 0);
          if (newQty > 0) {
            return { ...i, cartQty: newQty };
          }
        }
        return i;
      }),
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((i) => i.item_id !== id));
  };

  const handleClear = () => {
    setCart([]);
    setNotes('');
    setCustomerName('');
    setLocationName('');
    setDueDate('');
    setCollaborators('');
    setEmployeeId('');
    setEmployeePin('');
    setIsPinModalOpen(false);
    setIsPinVerifying(false);
    setPinDraft('');
  };

  const handleSelectItemKind = (kind: BorrowItemKind) => {
    setSelectedItemKind(kind);
    setSearch('');
    setSelectedCategory('All');
  };

  const handleBackToItemKindSelection = () => {
    handleClear();
    setStep('selection');
    setSelectedItemKind(null);
    setSearch('');
    setSelectedCategory('All');
  };

  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pinDigits = useMemo(() => {
    const digits = pinDraft.split('');
    return Array.from({ length: 6 }, (_, i) => digits[i] || '');
  }, [pinDraft]);

  const handleOpenPinModal = () => {
    // Invalidate any previously verified PIN while re-entering.
    const currentDraft = employeePin;
    setEmployeePin('');
    setPinDraft(currentDraft);
    setIsPinModalOpen(true);
    setIsPinVerifying(false);
    setTimeout(() => pinInputRefs.current[currentDraft ? 5 : 0]?.focus(), 100);
  };

  const handleClosePinModal = () => {
    setIsPinModalOpen(false);
    setIsPinVerifying(false);
    setPinDraft('');
  };

  const handlePinDigitChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setPinDraft((prev) => {
      const digits = prev.split('');
      while (digits.length < 6) digits.push('');
      digits[index] = digit;
      return digits.join('').replace(/\s/g, '');
    });
    if (digit && index < 5) {
      pinInputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handlePinKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!pinDigits[index] && index > 0) {
        e.preventDefault();
        setPinDraft((prev) => {
          const digits = prev.split('');
          digits[index - 1] = '';
          return digits.join('');
        });
        pinInputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      pinInputRefs.current[index + 1]?.focus();
    }
  }, [pinDigits]);

  const handlePinPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    setPinDraft(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    setTimeout(() => pinInputRefs.current[focusIdx]?.focus(), 0);
  }, []);

  const revokeBorrowerSession = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Keep flow usable even if logout request fails.
    } finally {
      auth.clearToken();
    }
  }, []);

  const loginAsBorrower = useCallback(async (username: string, password: string) => {
    const loginRes = await api.login({
      username,
      password,
    });

    if (isTwoFactorChallengeResponse(loginRes)) {
      throw new Error(BORROW_KIOSK_TWO_FACTOR_ERROR);
    }

    if ('auth_state' in loginRes && loginRes.auth_state === 'password_change_required') {
      throw new Error('Initial password rotation required. Please sign in to the standard portal first to update your PIN.');
    }

    if (!('access_token' in loginRes)) {
      throw new Error('Invalid login response');
    }

    auth.setToken(loginRes.access_token);

    let borrowerUser = null;
    try {
      borrowerUser = await auth.getUser();
    } catch (error) {
      await revokeBorrowerSession();
      throw error;
    }

    if (!isBorrowerRole(borrowerUser?.role)) {
      await revokeBorrowerSession();
      throw new Error(BORROW_KIOSK_ROLE_ERROR);
    }

    return borrowerUser;
  }, [revokeBorrowerSession]);

  const handleConfirmPin = async () => {
    const pinValidationError = validatePinVerificationInput(employeeId, pinDraft);
    if (pinValidationError) {
      toast.error(pinValidationError);
      return;
    }

    const cleaned = pinDraft.replace(/\D/g, '');

    setIsPinVerifying(true);
    try {
      await loginAsBorrower(employeeId.trim(), cleaned);

      // Revoke verification session immediately; request submission will open a fresh session.
      await revokeBorrowerSession();

      setEmployeePin(cleaned);
      setIsPinModalOpen(false);
      setPinDraft('');
      toast.success('PIN verified');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid PIN';
      toast.error(message);
    } finally {
      setIsPinVerifying(false);
    }
  };

  const handleClearPin = () => {
    setPinDraft('');
    pinInputRefs.current[0]?.focus();
  };

  const handleSubmit = async () => {
    const requiresDueDate = cart.length > 0 && cart.every((item) => item.is_trackable);
    const validationError = validateBorrowSubmission({
      cart,
      employeeId,
      employeePin,
      customerName,
      locationName,
      dueDate,
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);

    let hasBorrowerSession = false;

    try {
      // 1. Validate credentials (Login) as borrower
      const borrowerUser = await loginAsBorrower(employeeId.trim(), employeePin.trim());
      hasBorrowerSession = true;

      // 2. Submit borrow request
      await posApi.createBatchBorrow({
        items: cart.map((i) => ({ item_id: i.item_id, qty_requested: i.cartQty })),
        notes: [
          `Employee ID: ${employeeId.trim()}`,
          collaborators.trim() ? `Collaborators: ${collaborators.trim()}` : '',
          notes ? notes.trim() : '',
        ]
          .filter(Boolean)
          .join(' | '),
        customer_name: customerName.trim(),
        location_name: locationName.trim(),
        return_at: requiresDueDate ? new Date(dueDate).toISOString() : undefined,
      });

      let displayName = employeeId.trim();
      if (borrowerUser) {
        displayName =
          [borrowerUser.first_name, borrowerUser.last_name].filter(Boolean).join(' ').trim() ||
          borrowerUser.username;
      }

      // Explicitly revoke the session server-side, then clear local token for shared devices.
      await revokeBorrowerSession();
      hasBorrowerSession = false;

      setSubmittedByEmployeeName(displayName);
      setSuccess(true);
      toast.success(`Borrow request submitted for ${cart.length} item(s) by ${displayName}`);

      // Invalidate queries to refresh available quantities
      queryClient.invalidateQueries({ queryKey: ['borrow', 'catalog'] });

      // Delay clearing and fetching to allow success animation
      setTimeout(() => {
        handleClear();
        setStep('selection');
        setSuccess(false);
        setSubmittedByEmployeeName(null);
      }, 3000);
    } catch (error: unknown) {
      if (hasBorrowerSession) {
        await revokeBorrowerSession();
      }

      // Ensure token is cleared even on error
      auth.clearToken();
      const message =
        error instanceof Error ? error.message : 'Failed to process borrow request';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 animate-in fade-in duration-300 bg-background text-foreground">
      {step === 'selection' ? (
        <SelectionView
          items={filteredItems}
          loading={loading}
          search={search}
          onSearchChange={setSearch}
          categories={categories}
          categoryLabels={categoryLabels}
          classificationLabels={classificationLabels}
          selectedItemKind={selectedItemKind}
          onSelectItemKind={handleSelectItemKind}
          onBackToItemKindSelection={handleBackToItemKindSelection}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          totalItems={items.length}
          cart={cart}
          totalCartItems={totalCartItems}
          onAddToCart={addToCart}
          onUpdateCartQty={updateCartQty}
          onRemoveFromCart={removeFromCart}
          onClear={handleClear}
          onProceed={() => setStep('checkout')}
        />
      ) : (
        <CheckoutView
          cart={cart}
          totalCartItems={totalCartItems}
          categoryLabels={categoryLabels}
          classificationLabels={classificationLabels}
          employeeId={employeeId}
          onEmployeeIdChange={setEmployeeId}
          employeePin={employeePin}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          locationName={locationName}
          onLocationNameChange={setLocationName}
          dueDate={dueDate}
          onDueDateChange={setDueDate}
          collaborators={collaborators}
          onCollaboratorsChange={setCollaborators}
          notes={notes}
          onNotesChange={setNotes}
          onBack={() => setStep('selection')}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          success={success}
          submittedByEmployeeName={submittedByEmployeeName}
          onOpenPinModal={handleOpenPinModal}
        />
      )}

      {isPinModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-md"
          onClick={handleClosePinModal}
        >
          <div
            className="w-full sm:max-w-md mx-0 sm:mx-4 rounded-t-2xl sm:rounded-2xl bg-card border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 sm:p-7 text-center relative border-b bg-muted/20">
              <button
                onClick={handleClosePinModal}
                aria-label="Close PIN modal"
                className="absolute right-3 sm:right-4 top-3 sm:top-4 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold">Security PIN</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-1.5">
                Enter your 6-digit employee PIN
              </p>
            </div>

            {/* PIN Boxes */}
            <div className="p-5 sm:p-7 pb-4 sm:pb-5">
              <div className="flex justify-center gap-2 sm:gap-2.5" onPaste={handlePinPaste}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <input
                    key={i}
                    ref={(el) => { pinInputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={pinDigits[i] ? '•' : ''}
                    onChange={(e) => handlePinDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(i, e)}
                    onFocus={(e) => e.target.select()}
                    className={`w-11 h-13 sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-bold rounded-xl border-2 bg-background transition-all duration-200 focus:outline-none tabular-nums ${pinDigits[i]
                      ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                      : 'border-muted focus:border-primary focus:ring-2 focus:ring-primary/20'
                      }`}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="p-5 sm:p-7 pt-2 flex gap-3 safe-bottom">
              <button
                onClick={handleClearPin}
                className="px-4 sm:px-5 h-11 sm:h-12 rounded-xl border bg-background text-sm font-medium text-foreground hover:bg-muted transition-all active:scale-[0.97] flex items-center gap-2"
              >
                <Delete className="w-4 h-4" />
                Clear
              </button>
              <button
                onClick={handleConfirmPin}
                disabled={pinDraft.replace(/\D/g, '').length !== 6 || isPinVerifying}
                className="flex-1 h-11 sm:h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 active:scale-[0.97] flex items-center justify-center gap-2.5 transition-all shadow-md shadow-primary/20 disabled:shadow-none"
              >
                {isPinVerifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {isPinVerifying ? 'Verifying...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
