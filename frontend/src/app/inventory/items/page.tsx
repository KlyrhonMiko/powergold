'use client';

import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { InventoryItem } from './api';
import { UnitManagement } from './UnitManagement';
import { BatchManagement } from './BatchManagement';
import { ItemHistory } from './ItemHistory';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDebounce } from './lib/useDebounce';
import { useInventoryItems, useInventoryConfigs, useInventoryItemMutations } from './lib/useItemQueries';
import type { InventoryItemFormData } from './lib/inventoryItemForm';
import { validateInventoryItemForm } from './lib/validation';
import { InventoryItemsHeader } from './components/InventoryItemsHeader';
import { InventoryItemsToolbar } from './components/InventoryItemsToolbar';
import { InventoryItemsTable } from './components/InventoryItemsTable';
import { InventoryItemFormModal } from './components/InventoryItemFormModal';
import { QrCodeModal } from '@/components/ui/QrCodeModal';

const DEFAULT_PER_PAGE = 10;

export default function InventoryPage() {
  // Filter state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  const [activeTab, setActiveTab] = useState<'equipments' | 'materials'>('equipments');
  const debouncedSearch = useDebounce(search, 400);
  const debouncedCategory = useDebounce(categoryFilter, 400);

  // CRUD modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState<InventoryItemFormData>({
    name: '',
    category: '',
    classification: '',
    item_type: '',
    unit_of_measure: '',
    is_trackable: false,
    description: '',
  });

  const [unitManagementItemId, setUnitManagementItemId] = useState<string | null>(null);
  const [batchManagementItemId, setBatchManagementItemId] = useState<string | null>(null);
  const [itemHistoryItemId, setItemHistoryItemId] = useState<string | null>(null);
  const [qrCodeItem, setQrCodeItem] = useState<InventoryItem | null>(null);

  // Queries
  const { data: configsData } = useInventoryConfigs();
  const { classifications = [], itemTypes = [], categories = [], unitOfMeasures = [] } = configsData || {};

  const { data: itemsResponse, isLoading: itemsLoading, error: itemsError } = useInventoryItems({
    page,
    per_page: perPage,
    search: debouncedSearch || undefined,
    category: debouncedCategory || undefined,
    classification: classificationFilter || undefined,
    item_type: itemTypeFilter || undefined,
    is_trackable: activeTab === 'equipments',
  });

  const { createItem, updateItem, deleteItem } = useInventoryItemMutations();

  const items = itemsResponse?.data || [];
  const meta = itemsResponse?.meta || null;

  // Reset page to 1 whenever any filter changes (but not when page itself changes)
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, debouncedCategory, classificationFilter, itemTypeFilter, perPage, activeTab]);

  const resetForm = () => {
    setFormData({ name: '', category: '', classification: '', item_type: '', unit_of_measure: '', is_trackable: activeTab === 'equipments', description: '' });
    setEditingItem(null);
    setIsModalOpen(false);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      classification: item.classification || '',
      item_type: item.item_type || '',
      unit_of_measure: item.unit_of_measure || '',
      is_trackable: item.is_trackable ?? false,
      description: item.description || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateInventoryItemForm(formData, {
      categories: categories.map((entry) => entry.key),
      itemTypes: itemTypes.map((entry) => entry.key),
      unitOfMeasures: unitOfMeasures.map((entry) => entry.key),
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      if (editingItem) {
        await updateItem.mutateAsync({
          id: editingItem.item_id,
          data: {
            name: formData.name,
            category: formData.category,
            classification: formData.classification || undefined,
            item_type: formData.item_type || undefined,
            unit_of_measure: formData.is_trackable ? undefined : formData.unit_of_measure || undefined,
            is_trackable: formData.is_trackable,
            description: formData.description || undefined,
          }
        });
        toast.success('Equipment updated successfully');
      } else {
        await createItem.mutateAsync({
          name: formData.name,
          category: formData.category,
          classification: formData.classification || undefined,
          item_type: formData.item_type || undefined,
          unit_of_measure: formData.is_trackable ? undefined : formData.unit_of_measure || undefined,
          is_trackable: formData.is_trackable,
          description: formData.description || undefined,
        });
        toast.success('New equipment added to catalog');
      }
      resetForm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save equipment';
      toast.error(msg);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this equipment?')) return;
    try {
      await deleteItem.mutateAsync(itemId);
      toast.success('Item removed from inventory');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      toast.error(msg);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <InventoryItemsHeader onAdd={() => setIsModalOpen(true)} kind={activeTab} />

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 p-1 bg-muted/50 w-fit rounded-xl border border-border/50">
        <button
          onClick={() => setActiveTab('equipments')}
          className={cn(
            "px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
            activeTab === 'equipments'
              ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          Equipments
        </button>
        <button
          onClick={() => setActiveTab('materials')}
          className={cn(
            "px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
            activeTab === 'materials'
              ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          Materials
        </button>
      </div>

      {itemsError && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 px-4 py-3 rounded-xl text-sm flex items-center gap-3 animate-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p>{itemsError.message}</p>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <InventoryItemsToolbar
          search={search}
          onSearchChange={setSearch}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          categories={categories}
          meta={meta}
          classificationFilter={classificationFilter}
          onClassificationFilterChange={setClassificationFilter}
          itemTypeFilter={itemTypeFilter}
          onItemTypeFilterChange={setItemTypeFilter}
          classifications={classifications}
          itemTypes={itemTypes}
          onClearExpandedFilters={() => {
            setClassificationFilter('');
            setItemTypeFilter('');
          }}
        />

        <InventoryItemsTable
          items={items}
          loading={itemsLoading}
          categories={categories}
          onOpenHistory={(itemId) => setItemHistoryItemId(itemId)}
          onOpenUnitManagement={(itemId) => setUnitManagementItemId(itemId)}
          onOpenBatchManagement={(itemId) => setBatchManagementItemId(itemId)}
          onOpenEdit={openEditModal}
          onOpenQrCode={(item) => setQrCodeItem(item)}
          onDelete={handleDelete}
        />

        {meta && (
          <Pagination
            meta={meta}
            onPageChange={setPage}
          />
        )}
      </div>

      {isModalOpen && (
        <InventoryItemFormModal
          editingItem={editingItem}
          formData={formData}
          classifications={classifications}
          itemTypes={itemTypes}
          categories={categories}
          unitOfMeasures={unitOfMeasures}
          setFormData={setFormData}
          onClose={() => { }}
          onSubmit={handleSave}
          resetForm={resetForm}
        />
      )}

      {unitManagementItemId && (
        <UnitManagement
          itemId={unitManagementItemId}
          onClose={() => setUnitManagementItemId(null)}
        />
      )}

      {batchManagementItemId && (
        <BatchManagement
          itemId={batchManagementItemId}
          onClose={() => setBatchManagementItemId(null)}
        />
      )}

      {itemHistoryItemId && (
        <ItemHistory
          itemId={itemHistoryItemId}
          onClose={() => setItemHistoryItemId(null)}
        />
      )}

      {qrCodeItem && (
        <QrCodeModal
          value={JSON.stringify({ type: 'item', id: qrCodeItem.item_id })}
          title={qrCodeItem.name}
          subtitle={qrCodeItem.description || qrCodeItem.category}
          onClose={() => setQrCodeItem(null)}
        />
      )}
    </div>
  );
}
