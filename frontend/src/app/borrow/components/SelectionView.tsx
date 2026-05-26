'use client';

import { useState } from 'react';
import type { BorrowCatalogItem } from '../api';
import { CartItem } from '../lib/types';
import { formatCategoryLabel } from '../lib/utils';
import { formatQuantity, formatQuantityWithUnit } from '@/lib/inventoryQuantity';
import {
  Search,
  ShoppingCart,
  Undo2,
  Plus,
  Minus,
  Trash2,
  Loader2,
  Package2,
  X,
  ArrowRight,
  ChevronUp,
} from 'lucide-react';

interface SelectionViewProps {
  items: BorrowCatalogItem[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  categories: string[];
  categoryLabels: Record<string, string>;
  classificationLabels: Record<string, string>;
  selectedItemKind: 'trackable' | 'untrackable';
  onBack: () => void;
  selectedCategory: string;
  onCategoryChange: (v: string) => void;
  totalItems: number;
  hasMoreItems: boolean;
  isLoadingMoreItems: boolean;
  onLoadMore: () => void;
  cart: CartItem[];
  totalCartItems: number;
  onAddToCart: (item: BorrowCatalogItem) => void;
  onUpdateCartQty: (id: string, delta: number) => void;
  onRemoveFromCart: (id: string) => void;
  onClear: () => void;
  onProceed: () => void;
}

export function SelectionView({
  items,
  loading,
  search,
  onSearchChange,
  categories,
  categoryLabels,
  classificationLabels,
  selectedItemKind,
  onBack,
  selectedCategory,
  onCategoryChange,
  totalItems,
  hasMoreItems,
  isLoadingMoreItems,
  onLoadMore,
  cart,
  totalCartItems,
  onAddToCart,
  onUpdateCartQty,
  onRemoveFromCart,
  onClear,
  onProceed,
}: SelectionViewProps) {
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const selectedKindLabel = selectedItemKind === 'trackable' ? 'Equipments' : 'Materials';

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:h-[calc(100vh-2rem)] animate-in fade-in duration-500">
        {/* Main Content: Item Selection */}
        <div className="flex-1 flex flex-col min-w-0 bg-background rounded-2xl border shadow-sm overflow-hidden">
          {/* Header/Search Area */}
          <div className="p-4 lg:p-6 border-b bg-card">
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 justify-between items-start sm:items-center">
              <div>
                <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">Select Items</h1>
                <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 lg:mt-1">
                  Browse and add {selectedKindLabel.toLowerCase()} to your request
                  <span className="ml-1.5 text-[11px] font-medium text-muted-foreground/70">
                    ({totalItems} total)
                  </span>
                </p>
              </div>

              <div className="flex w-full sm:w-auto items-center gap-2">
                <span className="hidden sm:inline-flex rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                  {selectedKindLabel}
                </span>
                <button
                  onClick={onBack}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Back to sign in"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Back
                </button>
              </div>

              <div className="relative w-full sm:w-72 lg:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search inventory..."
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="w-full h-10 lg:h-11 pl-9 pr-9 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
                {search && (
                  <button
                    onClick={() => onSearchChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Categories */}
            <div className="flex gap-1.5 lg:gap-2 mt-3 lg:mt-5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
              {categories.map((cat) => {
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => onCategoryChange(cat)}
                    className={`px-3.5 lg:px-5 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium whitespace-nowrap transition-all duration-200 ${isActive
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95'
                      }`}
                  >
                    {cat === 'All' ? 'All Items' : categoryLabels[cat] || cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Item Grid */}
          <div className="flex-1 overflow-y-auto p-3 lg:p-6 bg-muted/5">
            {loading ? (
              <div className="h-64 lg:h-full flex flex-col items-center justify-center text-muted-foreground">
                <div className="relative">
                  <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 lg:w-7 lg:h-7 animate-spin text-primary" />
                  </div>
                </div>
                <p className="text-sm mt-3 lg:mt-4 font-medium">Loading inventory...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="h-64 lg:h-full flex flex-col items-center justify-center text-muted-foreground">
                <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-3 lg:mb-4">
                  <Package2 className="w-8 h-8 lg:w-10 lg:h-10 opacity-30" />
                </div>
                <p className="font-medium text-foreground text-base lg:text-lg">No items found</p>
                <p className="text-xs lg:text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 lg:gap-4 pb-20 lg:pb-0">
                  {items.map((item) => {
                    const inCart = cart.find((c) => c.item_id === item.item_id);
                    const outOfStock = item.available_qty <= 0;
                    const atStockLimit = Boolean(inCart && inCart.cartQty >= item.available_qty);
                    return (
                      <button
                        key={item.item_id}
                        onClick={() => onAddToCart(item)}
                        disabled={outOfStock || atStockLimit}
                        className={`group relative flex flex-col text-left p-3 lg:p-4 rounded-xl border bg-card transition-all duration-200
                        ${outOfStock || atStockLimit
                          ? 'opacity-40 cursor-not-allowed grayscale'
                          : 'hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30 active:translate-y-0 active:shadow-md active:scale-[0.98]'
                        }
                        ${inCart ? 'ring-2 ring-primary border-transparent shadow-md shadow-primary/10' : ''}`}
                      >
                        {inCart && (
                          <div className="absolute -top-2 -right-2 lg:-top-2.5 lg:-right-2.5 w-6 h-6 lg:w-7 lg:h-7 rounded-full bg-primary text-primary-foreground text-[10px] lg:text-xs font-bold flex items-center justify-center shadow-md shadow-primary/30 animate-in zoom-in-50 duration-200">
                            {formatQuantity(inCart.cartQty)}
                          </div>
                        )}

                        <div className="flex-1">
                          <div className="inline-flex items-center px-2 py-0.5 lg:px-2.5 lg:py-1 rounded-md text-[10px] lg:text-[11px] font-medium bg-muted/70 text-muted-foreground mb-2 lg:mb-3">
                            {categoryLabels[item.category] || item.category}
                          </div>
                          {item.classification && (
                            <div className="inline-flex items-center px-2 py-0.5 lg:px-2.5 lg:py-1 rounded-md text-[10px] lg:text-[11px] font-medium bg-primary/5 text-primary mb-2 lg:mb-3 ml-2 lg:ml-2.5">
                              {classificationLabels[item.classification] || formatCategoryLabel(item.classification)}
                            </div>
                          )}
                          <h3 className="font-medium text-xs lg:text-sm text-foreground leading-snug line-clamp-2">
                            {item.name}
                          </h3>
                        </div>

                        <div className="mt-3 lg:mt-4 flex items-end justify-between">
                          <div>
                            <p className="text-[10px] lg:text-[11px] text-muted-foreground mb-0.5 font-medium uppercase tracking-wider">
                              Available
                            </p>
                            <p
                              className={`font-bold text-lg lg:text-xl leading-none ${outOfStock ? 'text-destructive' : 'text-foreground'
                                }`}
                            >
                              {formatQuantity(item.available_qty)}
                            </p>
                          </div>

                          {!outOfStock && (
                            <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl flex items-center justify-center transition-all duration-200 ${
                              atStockLimit
                                ? 'bg-muted/60 text-muted-foreground'
                                : 'bg-muted/60 text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md'
                            }`}>
                              <Plus className="w-4 h-4 lg:w-5 lg:h-5" />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {hasMoreItems && (
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={onLoadMore}
                      disabled={isLoadingMoreItems}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoadingMoreItems ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading more
                        </>
                      ) : (
                        <>
                          Load more items
                          <ChevronUp className="h-4 w-4 rotate-180" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Desktop Sidebar: Cart Controls — hidden on mobile */}
        <div className="hidden lg:flex w-96 shrink-0 flex-col bg-card rounded-2xl border shadow-sm overflow-hidden">
          {/* Sidebar Header */}
          <div className="p-6 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-base">Borrow Request</h2>
                {cart.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {cart.length} item{cart.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            </div>
            {cart.length > 0 && (
              <button
                onClick={onClear}
                className="text-sm text-muted-foreground hover:text-destructive flex items-center gap-1.5 transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-6">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <div className="w-20 h-20 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                  <ShoppingCart className="w-9 h-9 opacity-20" />
                </div>
                <p className="text-sm text-center text-muted-foreground/80 max-w-[220px] leading-relaxed">
                  Your request is empty. Tap items from the catalog to add them.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => {
                  const atStockLimit = item.cartQty >= item.available_qty;
                  return (
                  <div
                    key={item.item_id}
                    className="flex flex-col gap-3 p-4 rounded-xl border bg-muted/20 hover:bg-muted/30 transition-colors animate-in slide-in-from-right-2 duration-200"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm font-medium line-clamp-2 leading-snug">{item.name}</p>
                      <button
                        onClick={() => onRemoveFromCart(item.item_id)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0 p-1.5 rounded-lg"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground font-medium">
                        {formatQuantityWithUnit(item.available_qty, item.unit_of_measure)} available
                      </p>
                      <div className="flex items-center bg-background rounded-xl border shadow-sm">
                        <button
                          onClick={() => onUpdateCartQty(item.item_id, -1)}
                          className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-l-xl hover:bg-muted transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-10 text-center text-sm font-semibold tabular-nums">
                          {formatQuantity(item.cartQty)}
                        </span>
                        <button
                          onClick={() => onUpdateCartQty(item.item_id, 1)}
                          disabled={atStockLimit}
                          className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-r-xl hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer: Summary & Action */}
          <div className="p-6 border-t bg-muted/5">
            <div className="flex justify-between items-end mb-5">
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Items</span>
              </div>
              <span className="text-3xl font-bold leading-none tabular-nums">{formatQuantity(totalCartItems)}</span>
            </div>

            <button
              onClick={onProceed}
              disabled={cart.length === 0}
              className="w-full h-13 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 active:scale-[0.98] flex items-center justify-center gap-2.5 transition-all duration-200 shadow-md shadow-primary/20 disabled:shadow-none text-[15px]"
            >
              Review Request
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ===== Mobile Floating Cart Bar ===== */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40">
        {/* Expandable cart drawer */}
        {mobileCartOpen && cart.length > 0 && (
          <div
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
            onClick={() => setMobileCartOpen(false)}
          />
        )}

        {mobileCartOpen && cart.length > 0 && (
          <div className="relative z-50 bg-card border-t border-x rounded-t-2xl shadow-2xl mx-1 max-h-[60vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
            {/* Drawer header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">
                  {cart.length} item{cart.length !== 1 ? 's' : ''} selected
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClear}
                  className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
                <button
                  onClick={() => setMobileCartOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.map((item) => {
                const atStockLimit = item.cartQty >= item.available_qty;
                return (
                <div
                  key={item.item_id}
                  className="flex items-center gap-3 p-3 rounded-xl border bg-muted/20"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatQuantityWithUnit(item.available_qty, item.unit_of_measure)} available</p>
                  </div>
                  <div className="flex items-center bg-background rounded-lg border shadow-sm shrink-0">
                    <button
                      onClick={() => onUpdateCartQty(item.item_id, -1)}
                      className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-l-lg hover:bg-muted transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-7 text-center text-xs font-semibold tabular-nums">{formatQuantity(item.cartQty)}</span>
                    <button
                      onClick={() => onUpdateCartQty(item.item_id, 1)}
                      disabled={atStockLimit}
                      className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-r-lg hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => onRemoveFromCart(item.item_id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sticky bottom bar */}
        <div className="relative z-50 bg-card/95 backdrop-blur-lg border-t px-4 py-3 flex items-center gap-3 safe-bottom">
          {cart.length > 0 ? (
            <>
              <button
                onClick={() => setMobileCartOpen(!mobileCartOpen)}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                  </div>
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm">
                    {formatQuantity(totalCartItems)}
                  </div>
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-semibold">
                    {cart.length} item{cart.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Tap to review</p>
                </div>
                <ChevronUp className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${mobileCartOpen ? 'rotate-180' : ''}`} />
              </button>

              <button
                onClick={onProceed}
                className="h-11 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-2 active:scale-[0.97] transition-all shadow-md shadow-primary/20"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 w-full opacity-60">
              <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Tap items above to get started</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
