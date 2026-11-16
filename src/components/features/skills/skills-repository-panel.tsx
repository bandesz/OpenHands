import React from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useSkillCatalog } from "#/hooks/query/use-skill-catalog";
import {
  useRemoveSkillsRepository,
  useSaveSkillsRepository,
  useSkillsRepository,
  useSyncSkillsRepository,
} from "#/hooks/query/use-skills-repository";
import { I18nKey } from "#/i18n/declaration";
import { formControlFieldClassName } from "#/utils/form-control-classes";
import { modalTitleLgMediumClassName } from "#/utils/modal-classes";
import { cn } from "#/utils/utils";

const SKILLS_REPOSITORY_URL_INPUT_ID = "skills-repository-url";
const SKILLS_REPOSITORY_URL_ERROR_ID = "skills-repository-url-error";
const DIRTY_REPOSITORY_ERROR_CODE = "dirty";
const SCP_GIT_URL = /^git@[^/\s:]+:[^\s]+$/;
const SENSITIVE_URL_PARAMETER_MARKERS = [
  "authorization",
  "cookie",
  "credential",
  "key",
  "password",
  "secret",
  "session",
  "token",
];

function hasSensitiveUrlParameter(value: string): boolean {
  const hashIndex = value.indexOf("#");
  const withoutFragment = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : value.slice(hashIndex + 1);
  const queryIndex = withoutFragment.indexOf("?");
  const query = queryIndex === -1 ? "" : withoutFragment.slice(queryIndex + 1);
  const names = [
    ...new URLSearchParams(query).keys(),
    ...new URLSearchParams(fragment).keys(),
  ];
  return names.some((name) => {
    const normalized = name.toLowerCase();
    return SENSITIVE_URL_PARAMETER_MARKERS.some((marker) =>
      normalized.includes(marker),
    );
  });
}

function hasCredentialUserinfo(value: string, protocol: string): boolean {
  const match = /^(?:https?|ssh):\/\/([^/?#]*)/iu.exec(value);
  if (!match) return false;
  const at = match[1].lastIndexOf("@");
  if (at < 0) return false;
  const userinfo = match[1].slice(0, at);
  if (protocol === "http:" || protocol === "https:") return true;
  return protocol === "ssh:" && userinfo.includes(":");
}

function parsedUrlHasCredential(parsed: URL): boolean {
  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    return parsed.username.length > 0 || parsed.password.length > 0;
  }
  if (parsed.protocol === "ssh:") {
    return parsed.password.length > 0;
  }
  return false;
}

function isSkillsRepositoryGitUrl(value: string): boolean {
  if (value.length === 0 || /\s/u.test(value)) return false;
  if (hasSensitiveUrlParameter(value)) return false;
  if (SCP_GIT_URL.test(value)) return true;
  try {
    const parsed = new URL(value);
    const allowedScheme =
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "ssh:";
    return (
      allowedScheme &&
      parsed.hostname.length > 0 &&
      !hasCredentialUserinfo(value, parsed.protocol) &&
      !parsedUrlHasCredential(parsed)
    );
  } catch {
    return false;
  }
}

function skillsRepositorySaveError(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("error" in error)) {
    return null;
  }
  const message = error.error;
  return typeof message === "string" && message.length > 0 ? message : null;
}

function repositoryFailureMessage(error: unknown): string | null {
  if (typeof error === "string" && error.length > 0) return error;
  if (error instanceof Error && error.message.length > 0) return error.message;
  return null;
}

function repositoryActionFailureMessage(error: unknown): string | null {
  return skillsRepositorySaveError(error) ?? repositoryFailureMessage(error);
}

type RepositoryBackendScope = {
  id: string;
  host: string;
};

function sameRepositoryBackend(
  active: RepositoryBackendScope,
  origin: RepositoryBackendScope,
): boolean {
  return active.id === origin.id && active.host === origin.host;
}

function syncFailureMessage(
  error: unknown,
  dirtyMessage: string,
): string | null {
  if (typeof error !== "object" || error === null) return null;
  if (
    "error_code" in error &&
    error.error_code === DIRTY_REPOSITORY_ERROR_CODE
  ) {
    return dirtyMessage;
  }
  return repositoryActionFailureMessage(error);
}

function sourceIsInCheckout(
  source: string | null | undefined,
  checkoutPath: string | null,
): boolean {
  if (!source || !checkoutPath) return false;
  if (source === checkoutPath) return true;
  const prefix = checkoutPath.endsWith("/") ? checkoutPath : `${checkoutPath}/`;
  return source.startsWith(prefix);
}

export function SkillsRepositoryPanel() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const repositoryQuery = useSkillsRepository();
  const catalog = useSkillCatalog();
  const saveRepository = useSaveSkillsRepository();
  const syncRepository = useSyncSkillsRepository();
  const removeRepository = useRemoveSkillsRepository();
  const repository = repositoryQuery.data;
  const [draftUrl, setDraftUrl] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = React.useState(false);
  const url = draftUrl ?? repository?.url ?? "";
  const mutationOriginRef = React.useRef<{
    save: RepositoryBackendScope | null;
    sync: RepositoryBackendScope | null;
    remove: RepositoryBackendScope | null;
  }>({ save: null, sync: null, remove: null });
  const resetRepositoryMutationsRef = React.useRef(() => {});
  resetRepositoryMutationsRef.current = () => {
    saveRepository.reset();
    syncRepository.reset();
    removeRepository.reset();
  };

  const beginRepositoryMutation = (kind: "save" | "sync" | "remove") => {
    mutationOriginRef.current[kind] = { id: backend.id, host: backend.host };
  };

  React.useEffect(() => {
    setDraftUrl(null);
    setSaveError(null);
    setRemoveConfirmOpen(false);
    mutationOriginRef.current = { save: null, sync: null, remove: null };
    resetRepositoryMutationsRef.current();
  }, [backend.id, backend.host]);

  if (!repository) {
    if (repositoryQuery.isError) {
      return (
        <div
          data-testid="skills-repository-panel"
          className="flex flex-col gap-3"
        >
          <p
            data-testid="skills-repository-status"
            className="text-sm text-danger"
          >
            {repositoryFailureMessage(repositoryQuery.error)}
          </p>
        </div>
      );
    }
    return (
      <div data-testid="skills-repository-panel">
        <div
          data-testid="skills-repository-loading"
          className="h-12 animate-pulse rounded-2xl bg-tertiary"
        />
      </div>
    );
  }

  const saveStartedHere =
    mutationOriginRef.current.save !== null &&
    sameRepositoryBackend(backend, mutationOriginRef.current.save);
  const syncStartedHere =
    mutationOriginRef.current.sync !== null &&
    sameRepositoryBackend(backend, mutationOriginRef.current.sync);
  const isSaving = saveStartedHere && saveRepository.isPending;
  const isSyncPending = syncStartedHere && syncRepository.isPending;
  const isSyncing =
    isSaving || isSyncPending || repository.status === "syncing";
  const syncFailure =
    isSyncPending || !syncStartedHere
      ? null
      : syncFailureMessage(
          syncRepository.error,
          t(I18nKey.SETTINGS$SKILLS_REPOSITORY_DIRTY),
        );
  const resourceError =
    !isSyncing && syncFailure === null && repository.status === "error"
      ? repository.error
      : null;
  const trimmedUrl = url.trim();
  const urlIsValid = isSkillsRepositoryGitUrl(trimmedUrl);
  const canSave = urlIsValid && !isSaving;
  const displayedSaveError = isSaving || isSyncPending ? null : saveError;
  const shortSha = repository.commit_sha?.slice(0, 7) ?? "";
  const showReadyStatus =
    !isSyncing && syncFailure === null && repository.status === "ready";
  const showPreviousSha =
    !isSyncing &&
    !showReadyStatus &&
    shortSha.length > 0 &&
    (syncFailure !== null || repository.status === "error");
  const hasRepositorySkills =
    catalog.data?.some((skill) =>
      sourceIsInCheckout(skill.source, repository.checkout_path),
    ) ?? false;
  const showNoSkills =
    repository.status === "ready" &&
    catalog.isSuccess &&
    !catalog.isFetching &&
    !hasRepositorySkills;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    beginRepositoryMutation("save");
    saveRepository.mutate(trimmedUrl, {
      onSuccess: () => {
        setDraftUrl(null);
        setSaveError(null);
      },
      onError: (error) => {
        setSaveError(repositoryActionFailureMessage(error));
      },
    });
  };

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDraftUrl(event.target.value);
    setSaveError(null);
  };

  const closeRemoveDialog = () => setRemoveConfirmOpen(false);

  const handleConfirmRemove = () => {
    beginRepositoryMutation("remove");
    removeRepository.mutate(undefined, {
      onSuccess: () => {
        setDraftUrl(null);
        setSaveError(null);
        mutationOriginRef.current.sync = null;
        syncRepository.reset();
        setRemoveConfirmOpen(false);
      },
      onError: (error) => {
        setSaveError(repositoryActionFailureMessage(error));
      },
    });
  };

  const hasSavedRepository = (repository.url ?? "").length > 0;
  const removeTitle = t(I18nKey.SETTINGS$SKILLS_REPOSITORY_REMOVE_TITLE);

  return (
    <div data-testid="skills-repository-panel" className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-3">
        <label htmlFor={SKILLS_REPOSITORY_URL_INPUT_ID} className="sr-only">
          {t(I18nKey.SETTINGS$SKILLS_REPOSITORY_URL)}
        </label>
        <div className="flex min-w-0 items-center gap-2">
          <input
            id={SKILLS_REPOSITORY_URL_INPUT_ID}
            data-testid="skills-repository-url"
            type="text"
            value={url}
            disabled={isSaving}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!urlIsValid}
            aria-describedby={
              urlIsValid ? undefined : SKILLS_REPOSITORY_URL_ERROR_ID
            }
            onChange={handleUrlChange}
            className={cn(formControlFieldClassName, "min-w-0 flex-1")}
          />
          <BrandButton
            type="submit"
            variant="primary"
            testId="skills-repository-save"
            isDisabled={!canSave}
            className="shrink-0"
          >
            {t(I18nKey.BUTTON$SAVE)}
          </BrandButton>
          {repository.status === "ready" ? (
            <BrandButton
              type="button"
              variant="secondary"
              testId="skills-repository-sync"
              isDisabled={isSaving || isSyncPending}
              className="shrink-0"
              onClick={() => {
                beginRepositoryMutation("sync");
                syncRepository.mutate(undefined, {
                  onSuccess: () => {
                    setSaveError(null);
                  },
                });
              }}
            >
              {t(I18nKey.SETTINGS$SKILLS_REPOSITORY_SYNC)}
            </BrandButton>
          ) : null}
          {hasSavedRepository ? (
            <BrandButton
              type="button"
              variant="secondary"
              testId="skills-repository-remove"
              className="shrink-0"
              onClick={() => setRemoveConfirmOpen(true)}
            >
              {t(I18nKey.COMMON$REMOVE)}
            </BrandButton>
          ) : null}
        </div>
        {urlIsValid ? null : (
          <p
            id={SKILLS_REPOSITORY_URL_ERROR_ID}
            className="text-sm text-danger"
          >
            {t(I18nKey.SETTINGS$SKILLS_REPOSITORY_INVALID_URL)}
          </p>
        )}
        {isSyncing ||
        showReadyStatus ||
        syncFailure ||
        resourceError ||
        showPreviousSha ||
        displayedSaveError ? (
          <p
            data-testid="skills-repository-status"
            className="text-sm text-tertiary-light"
          >
            {isSyncing ? t(I18nKey.SETTINGS$SKILLS_REPOSITORY_SYNCING) : null}
            {showReadyStatus ? (
              <>
                {t(I18nKey.SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE)}
                {shortSha ? (
                  <>
                    {" "}
                    <span className="font-mono">{shortSha}</span>
                  </>
                ) : null}
              </>
            ) : null}
            {syncFailure ? (
              <span className="block text-danger">{syncFailure}</span>
            ) : null}
            {resourceError ? (
              <span className="block text-danger">{resourceError}</span>
            ) : null}
            {showPreviousSha ? (
              <>
                {" "}
                <span className="font-mono">{shortSha}</span>
              </>
            ) : null}
            {displayedSaveError ? (
              <span className="block text-danger">{displayedSaveError}</span>
            ) : null}
          </p>
        ) : null}
        {showNoSkills ? (
          <p className="text-sm text-tertiary-light">
            {t(I18nKey.SETTINGS$SKILLS_REPOSITORY_NO_SKILLS)}
          </p>
        ) : null}
      </form>
      {removeConfirmOpen ? (
        <ModalBackdrop onClose={closeRemoveDialog} aria-label={removeTitle}>
          <div
            className={cn(
              "relative flex flex-col gap-4 rounded-xl border border-border bg-base-secondary p-6",
              modalWidthClassName("sm"),
              MODAL_MAX_WIDTH_VIEWPORT,
            )}
          >
            <h2 className={modalTitleLgMediumClassName}>{removeTitle}</h2>
            <p className="text-sm text-muted">
              {t(I18nKey.SETTINGS$SKILLS_REPOSITORY_REMOVE_BODY)}
            </p>
            <div className="flex justify-end gap-2">
              <BrandButton
                type="button"
                variant="secondary"
                testId="skills-repository-remove-cancel"
                isDisabled={removeRepository.isPending}
                onClick={closeRemoveDialog}
              >
                {t(I18nKey.BUTTON$CANCEL)}
              </BrandButton>
              <BrandButton
                type="button"
                variant="danger"
                testId="skills-repository-remove-confirm"
                isDisabled={removeRepository.isPending}
                onClick={handleConfirmRemove}
              >
                {t(I18nKey.COMMON$REMOVE)}
              </BrandButton>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
