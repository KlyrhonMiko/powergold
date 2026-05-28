'use client';

import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useInventoryWebSocket } from '@/hooks/useInventoryWebSocket';
import { posApi, BorrowCatalogItem } from '@/app/borrow/api';
import { borrowApi } from '@/app/inventory/requests/api';
import type { ConfigRead } from '@/app/inventory/items/api';
import { CartItem } from '@/app/borrow/lib/types';
import { useDebounce } from '@/app/borrow/lib/useDebounce';
import { parseQuantityInput } from '@/lib/inventoryQuantity';
import { SelectionView } from '@/app/borrow/components/SelectionView';
import { ConsumableRequestCheckout } from '../components/ConsumableRequestCheckout';

interface TaxonomyData {
  categories: ConfigRead[];
  classifications: ConfigRead[];
}

const CATALOG_PAGE_SIZE = 40;

export default function InventoryConsumablesRequestPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useInventoryWebSocket();

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<'selection' | 'checkout'>('selection');
  const [success, setSuccess] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState('All');
  const debouncedSearch = useDebounce(search, 300);

  const catalogQuery = useInfiniteQuery({
    queryKey: ['inventory', 'consumable-request', debouncedSearch, selectedCategory],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      await posApi.listCatalog({
        page: pageParam,
        per_page: CATALOG_PAGE_SIZE,
        search: debouncedSearch || undefined,
        category: selectedCategory === 'All' ? undefined : selectedCategory,
        is_trackable: false,
      }),
    getNextPageParam: (lastPage) => {
      const meta = lastPage.meta;
      if (!meta) return undefined;
      const currentPage = meta.page ?? 1;
      const loaded = meta.offset + lastPage.data.length;
      return loaded < meta.total ? currentPage + 1 : undefined;
    },
  });

  const { data: taxonomy } = useQuery({
    queryKey: ['inventory', 'consumable-request', 'taxonomy'],
    queryFn: async () => {
      const res = await api.get<TaxonomyData>('/inventory/borrower/taxonomy');
      return res.data;
    },
  });

  const items = useMemo(
    () => catalogQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [catalogQuery.data],
  );

  const totalItems = catalogQuery.data?.pages[0]?.meta?.total ?? items.length;
  const hasMoreItems = Boolean(catalogQuery.hasNextPage);
  const isLoadingMoreItems = catalogQuery.isFetchingNextPage;
  const loading = catalogQuery.isLoading;

  const categoryLabels = useMemo(
    () => Object.fromEntries((taxonomy?.categories ?? []).map((category) => [category.key, category.value])),
    [taxonomy?.categories],
  );

  const classificationLabels = useMemo(
    () => Object.fromEntries((taxonomy?.classifications ?? []).map((classification) => [classification.key, classification.value])),
    [taxonomy?.classifications],
  );

  const categories = useMemo(
    () => ['All', ...(taxonomy?.categories ?? []).map((category) => category.key)],
    [taxonomy?.categories],
  );

  const totalCartItems = cart.reduce((accumulator, item) => accumulator + item.cartQty, 0);

  const addToCart = useCallback((item: BorrowCatalogItem) => {
    const stepQty = 1;
    setCart((previous) => {
      const existing = previous.find((entry) => entry.item_id === item.item_id);
      if (existing) {
        return previous.map((entry) =>
          entry.item_id === item.item_id
            ? {
                ...entry,
                cartQty: Math.min(
                  parseQuantityInput(String(entry.cartQty + stepQty), stepQty),
                  Math.max(item.available_qty, stepQty),
                ),
              }
            : entry,
        );
      }

      return [...previous, { ...item, cartQty: Math.min(stepQty, Math.max(item.available_qty, stepQty)) }];
    });
  }, []);

  const updateCartQty = useCallback((id: string, delta: number) => {
    setCart((previous) =>
      previous.map((entry) => {
        if (entry.item_id === id) {
          const stepQty = 1;
          const newQty = parseQuantityInput(String(entry.cartQty + delta * stepQty), 0);
          if (newQty > 0) {
            return { ...entry, cartQty: Math.min(newQty, entry.available_qty) };
          }
        }
        return entry;
      }),
    );
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart((previous) => previous.filter((entry) => entry.item_id !== id));
  }, []);

  const handleClear = useCallback(() => {
    setCart([]);
    setCompanyName('');
    setLocationName('');
    setDueDate('');
    setNotes('');
    setStep('selection');
    setSuccess(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (cart.length === 0) {
      toast.error('Add at least one item to the request');
      return;
    }

    if (!companyName.trim()) {
      toast.error('Company Name is required');
      return;
    }

    if (!locationName.trim()) {
      toast.error('Location is required');
      return;
    }

    if (!dueDate.trim()) {
      toast.error('Date is required');
      return;
    }

    const parsedDate = new Date(dueDate);
    if (Number.isNaN(parsedDate.getTime())) {
      toast.error('Date is invalid');
      return;
    }

    setIsSubmitting(true);
    try {
      await borrowApi.create({
        items: cart.map((item) => ({ item_id: item.item_id, qty_requested: item.cartQty })),
        customer_name: companyName.trim(),
        location_name: locationName.trim(),
        return_at: parsedDate.toISOString(),
        notes: notes.trim() || undefined,
      });

      toast.success(`Consumables request submitted for ${cart.length} item(s)`);
      queryClient.invalidateQueries({ queryKey: ['inventory', 'consumable-request'] });
      setSuccess(true);

      setTimeout(() => {
        handleClear();
      }, 2500);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit consumables request';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [cart, companyName, dueDate, handleClear, locationName, notes, queryClient]);

  return (
    <div className="min-h-screen p-4 md:p-6 animate-in fade-in duration-300 bg-background text-foreground">
      {step === 'selection' ? (
        <SelectionView
          items={items}
          loading={loading}
          search={search}
          onSearchChange={setSearch}
          categories={categories}
          categoryLabels={categoryLabels}
          classificationLabels={classificationLabels}
          selectedItemKind="untrackable"
          onBack={() => router.push('/inventory/requests')}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          totalItems={totalItems}
          hasMoreItems={hasMoreItems}
          isLoadingMoreItems={isLoadingMoreItems}
          onLoadMore={() => {
            void catalogQuery.fetchNextPage();
          }}
          cart={cart}
          totalCartItems={totalCartItems}
          onAddToCart={addToCart}
          onUpdateCartQty={updateCartQty}
          onRemoveFromCart={removeFromCart}
          onClear={handleClear}
          onProceed={() => setStep('checkout')}
          pageTitle="Select Consumable Items"
          pageDescription="Browse only consumable items and add them to your request"
          backLabel="Back to Requests"
          backTitle="Back to requests list"
        />
      ) : (
        <ConsumableRequestCheckout
          cart={cart}
          totalCartItems={totalCartItems}
          categoryLabels={categoryLabels}
          classificationLabels={classificationLabels}
          companyName={companyName}
          onCompanyNameChange={setCompanyName}
          locationName={locationName}
          onLocationNameChange={setLocationName}
          dueDate={dueDate}
          onDueDateChange={setDueDate}
          notes={notes}
          onNotesChange={setNotes}
          onBack={() => setStep('selection')}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          success={success}
          onStartOver={handleClear}
        />
      )}
    </div>
  );
}