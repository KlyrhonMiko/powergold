import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { borrowApi, BorrowListParams, BorrowEventsParams, BorrowActionPayload, BorrowReturnPayload } from '../api';
import { BorrowAction } from './types';

const STALE_TIME = 1000 * 30; // 30 seconds for highly operational data

export function useBorrowRequests(params: BorrowListParams) {
  return useQuery({
    queryKey: ['inventory', 'requests', 'list', params],
    queryFn: async () => await borrowApi.list(params),
    staleTime: STALE_TIME,
  });
}

export function useBorrowRequestEvents(requestId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['inventory', 'requests', requestId, 'events'],
    queryFn: async () => await borrowApi.getEvents(requestId),
    staleTime: STALE_TIME,
    enabled,
  });
}

export function useGlobalBorrowEvents(params: BorrowEventsParams) {
  return useQuery({
    queryKey: ['inventory', 'requests', 'events', 'global', params],
    queryFn: async () => await borrowApi.getAllEvents(params),
    staleTime: STALE_TIME,
  });
}

export function useBorrowAssignments(requestId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['inventory', 'requests', requestId, 'assignments'],
    queryFn: async () => {
      const [units, batches] = await Promise.all([
        borrowApi.getAssignedUnits(requestId),
        borrowApi.getAssignedBatches(requestId),
      ]);
      return { units: units.data, batches: batches.data };
    },
    staleTime: STALE_TIME,
    enabled,
  });
}

export function useBorrowMutations() {
  const queryClient = useQueryClient();

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'requests'] });
  };

  type BorrowActionHandler = (id: string, payload?: BorrowActionPayload | BorrowReturnPayload) => Promise<unknown>;

  const executeAction = useMutation({
    mutationFn: async ({ action, id, payload }: { action: BorrowAction; id: string; payload?: BorrowActionPayload | BorrowReturnPayload }) => {
      const handlers: Record<BorrowAction, BorrowActionHandler> = {
        approve: borrowApi.approve,
        reject: borrowApi.reject,
        void: borrowApi.void,
        release: borrowApi.release,
        return: borrowApi.return,
        reopen: borrowApi.reopen,
        close: borrowApi.close,
      };
      
      return handlers[action](id, payload);
    },
    onSuccess: (_, { id }) => {
      invalidateList();
      queryClient.invalidateQueries({ queryKey: ['inventory', 'requests', id] });
    },
  });

  return { executeAction, invalidateList };
}
