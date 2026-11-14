import React from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useSkillCatalog } from "#/hooks/query/use-skill-catalog";
import {
  useSaveSkillsRepository,
  useSkillsRepository,
} from "#/hooks/query/use-skills-repository";
import { I18nKey } from "#/i18n/declaration";
import { formControlFieldClassName } from "#/utils/form-control-classes";
import { cn } from "#/utils/utils";

const SKILLS_REPOSITORY_URL_INPUT_ID = "skills-repository-url";

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
  const repositoryQuery = useSkillsRepository();
  const catalog = useSkillCatalog();
  const saveRepository = useSaveSkillsRepository();
  const repository = repositoryQuery.data;
  const [draftUrl, setDraftUrl] = React.useState<string | null>(null);
  const url = draftUrl ?? repository?.url ?? "";

  if (!repository) {
    return (
      <div data-testid="skills-repository-panel">
        <div
          data-testid="skills-repository-loading"
          className="h-12 animate-pulse rounded-2xl bg-tertiary"
        />
      </div>
    );
  }

  const isSaving = saveRepository.isPending;
  const trimmedUrl = url.trim();
  const canSave = trimmedUrl.length > 0 && !isSaving;
  const shortSha = repository.commit_sha?.slice(0, 7) ?? "";
  const showReadyStatus = !isSaving && repository.status === "ready";
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
    saveRepository.mutate(trimmedUrl, {
      onSuccess: () => setDraftUrl(null),
    });
  };

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
            onChange={(event) => setDraftUrl(event.target.value)}
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
              isDisabled={isSaving}
              className="shrink-0"
            >
              {t(I18nKey.SETTINGS$SKILLS_REPOSITORY_SYNC)}
            </BrandButton>
          ) : null}
        </div>
        {isSaving || showReadyStatus ? (
          <p
            data-testid="skills-repository-status"
            className="text-sm text-tertiary-light"
          >
            {isSaving
              ? t(I18nKey.SETTINGS$SKILLS_REPOSITORY_SYNCING)
              : t(I18nKey.SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE)}
            {showReadyStatus && shortSha ? (
              <>
                {" "}
                <span className="font-mono">{shortSha}</span>
              </>
            ) : null}
          </p>
        ) : null}
        {showNoSkills ? (
          <p className="text-sm text-tertiary-light">
            {t(I18nKey.SETTINGS$SKILLS_REPOSITORY_NO_SKILLS)}
          </p>
        ) : null}
      </form>
    </div>
  );
}
