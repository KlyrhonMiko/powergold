'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { InventorySettingsTab } from './components/InventorySettingsTabs';
import { InventorySettingsHeader } from './components/InventorySettingsHeader';
import { InventorySettingsTabs } from './components/InventorySettingsTabs';
import { AlertSettings } from './components/AlertSettings';
import { ImportExportSettings } from './components/ImportExportSettings';
import { DictionarySettings } from './components/DictionarySettings';
import { useInventorySettings, useSettingMutations } from './lib/useSettingsQueries';

export default function InventorySettingsPage() {
  const [activeTab, setActiveTab] = useState<InventorySettingsTab>('system');

  // Dictionary Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const { data: settingsResponse, isLoading: loading, error: queryError } = useInventorySettings({
    page,
    per_page: perPage,
    key: search || undefined,
    category: categoryFilter || undefined,
  }, activeTab);

  const { deleteSetting, createSetting } = useSettingMutations();

  const settings = settingsResponse?.data || [];
  const meta = settingsResponse?.meta || null;
  const error = queryError ? (queryError as Error).message : null;

  const handleDelete = async (key: string, category: string) => {
    try {
      await deleteSetting.mutateAsync({ category, key });
      toast.success(`Deleted ${key} from ${category}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete setting';
      toast.error(message);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <InventorySettingsHeader />

      <InventorySettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 px-4 py-3 rounded-xl text-sm flex items-center gap-3 animate-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4" />
          <p>{error}</p>
        </div>
      )}

      <div className="min-h-[600px]">
        {activeTab === 'system' && <AlertSettings />}

        {activeTab === 'import-export' && <ImportExportSettings />}

        {activeTab === 'dictionary' && (
          <DictionarySettings
            settings={settings}
            loading={loading}
            meta={meta}
            categories={[
              'inventory_category',
              'inventory_item_type',
              'inventory_classification',
              'inventory_unit_of_measure',
              'inventory_status',
              'inventory_condition',
              'inventory_movements_reason_code',
            ]}
            search={search}
            onSearchChange={setSearch}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            onPageChange={setPage}
            onDelete={handleDelete}
            onAdd={async (data) => {
              try {
                await createSetting.mutateAsync(data);
                toast.success('Added new dictionary entry');
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed to add entry';
                toast.error(message);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
