import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SkillsRepositoryService from "#/api/skills-repository-service";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  AGENT_PROFILES_RETRY_OPTIONS,
  CONFIG_CACHE_OPTIONS,
  SKILL_CATALOG_QUERY_KEYS,
  SKILLS_REPOSITORY_QUERY_KEYS,
} from "#/hooks/query/query-keys";

const SKILLS_REPOSITORY_SYNC_POLL_MS = 2_000;

function repositorySyncStatus(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("status" in data)) {
    return undefined;
  }
  const { status } = data;
  return typeof status === "string" ? status : undefined;
}

export function useSkillsRepository() {
  const { backend } = useActiveBackend();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...SKILLS_REPOSITORY_QUERY_KEYS.all, backend.id, backend.host],
    queryFn: () => SkillsRepositoryService.get(),
    ...CONFIG_CACHE_OPTIONS,
    ...AGENT_PROFILES_RETRY_OPTIONS,
    refetchInterval: (query) =>
      query.state.data?.status === "syncing"
        ? SKILLS_REPOSITORY_SYNC_POLL_MS
        : false,
    meta: { disableToast: true },
  });

  // Each repository cache entry keeps its own sync status. Switching the
  // active backend observes a different entry, and a poll that started on the
  // previous one can still finish after that entry has no observer.
  useEffect(() => {
    const statuses = new Map<string, string | undefined>();
    const cache = queryClient.getQueryCache();

    for (const cached of cache.findAll({
      queryKey: SKILLS_REPOSITORY_QUERY_KEYS.all,
    })) {
      statuses.set(cached.queryHash, repositorySyncStatus(cached.state.data));
    }

    return cache.subscribe((event) => {
      if (event.type !== "updated") return;
      const [root, id, host] = event.query.queryKey;
      if (root !== SKILLS_REPOSITORY_QUERY_KEYS.all[0]) return;
      if (typeof id !== "string" || typeof host !== "string") return;

      const next = repositorySyncStatus(event.query.state.data);
      const previous = statuses.get(event.query.queryHash);
      if (previous === "syncing" && next !== undefined && next !== "syncing") {
        void queryClient.invalidateQueries({
          queryKey: [...SKILL_CATALOG_QUERY_KEYS.all, id, host],
        });
      }
      statuses.set(event.query.queryHash, next);
    });
  }, [queryClient]);

  return query;
}

export function useSaveSkillsRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (url: string) => SkillsRepositoryService.save(url),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: SKILLS_REPOSITORY_QUERY_KEYS.all,
        }),
        queryClient.invalidateQueries({
          queryKey: SKILL_CATALOG_QUERY_KEYS.all,
        }),
      ]);
    },
    meta: { disableToast: true },
  });
}

export function useSyncSkillsRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => SkillsRepositoryService.sync(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: SKILLS_REPOSITORY_QUERY_KEYS.all,
        }),
        queryClient.invalidateQueries({
          queryKey: SKILL_CATALOG_QUERY_KEYS.all,
        }),
      ]);
    },
    meta: { disableToast: true },
  });
}

export function useRemoveSkillsRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => SkillsRepositoryService.remove(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: SKILLS_REPOSITORY_QUERY_KEYS.all,
        }),
        queryClient.invalidateQueries({
          queryKey: SKILL_CATALOG_QUERY_KEYS.all,
        }),
      ]);
    },
    meta: { disableToast: true },
  });
}
