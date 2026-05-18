import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  inventoryApi,
  InventoryListParams,
  InventoryItemCreate,
  InventoryItemUpdate,
  InventoryUnitListParams,
} from '../api';

const STALE_TIME = 1000 * 60; // 1 minute

export function useInventoryItems(params: InventoryListParams) {
  return useQuery({
    queryKey: ['inventory', 'items', params],
    queryFn: async () => await inventoryApi.list(params),
    staleTime: STALE_TIME,
  });
}

export function useInventoryConfigs() {
  return useQuery({
    queryKey: ['inventory', 'configs', 'item_categories'],
    queryFn: async () => {
      const [classRes, typeRes, catRes, uomRes] = await Promise.all([
        inventoryApi.getConfigs('inventory_classification'),
        inventoryApi.getConfigs('inventory_item_type'),
        inventoryApi.getConfigs('inventory_category'),
        inventoryApi.getConfigs('inventory_unit_of_measure'),
      ]);
      return {
        classifications: classRes.data,
        itemTypes: typeRes.data,
        categories: catRes.data,
        unitOfMeasures: uomRes.data,
      };
    },
    staleTime: Infinity, // Configs rarely change
  });
}

export function useInventoryItemMutations() {
  const queryClient = useQueryClient();

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
  };

  const createItem = useMutation({
    mutationFn: (data: InventoryItemCreate) => inventoryApi.create(data),
    onSuccess: invalidateList,
  });

  const updateItem = useMutation({
    mutationFn: ({ id, data }: { id: string; data: InventoryItemUpdate }) => inventoryApi.update(id, data),
    onSuccess: invalidateList,
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => inventoryApi.delete(id),
    onSuccess: invalidateList,
  });

  return {
    createItem,
    updateItem,
    deleteItem,
  };
}

// Units
export function useInventoryUnits(itemId: string | undefined, params: InventoryUnitListParams, enabled = true) {
  return useQuery({
    queryKey: ['inventory', 'items', itemId ?? '', 'units', params],
    queryFn: async () => {
      if (!itemId) throw new Error('itemId is required for listing units');
      return await inventoryApi.listUnits(itemId, params);
    },
    enabled: Boolean(itemId) && enabled,
    staleTime: STALE_TIME,
  });
}

// Batches
export function useInventoryBatches(itemId: string, params: { page?: number; per_page?: number; status?: string; include_expired?: boolean }) {
  return useQuery({
    queryKey: ['inventory', 'items', itemId, 'batches', params],
    queryFn: async () => await inventoryApi.listBatches(itemId, params),
    staleTime: STALE_TIME,
  });
}
