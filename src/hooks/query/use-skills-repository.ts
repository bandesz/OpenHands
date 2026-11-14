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

export function useSkillsRepository() {
  const { backend } = useActiveBackend();

  return useQuery({
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
