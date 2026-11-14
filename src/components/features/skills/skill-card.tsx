import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { SkillInfo } from "#/types/settings";
import { cn } from "#/utils/utils";
import CopyIcon from "#/icons/copy.svg?react";
import CheckmarkIcon from "#/icons/checkmark.svg?react";
import { CirclePlusCheckToggle } from "#/components/shared/buttons/circle-plus-check-toggle";
import { SkillIconBadge } from "./skill-icon-badge";
import { SkillCardPillRow } from "./skill-card-pill-row";
import { getSkillCardDescription } from "./get-skill-card-description";
import { buildSkillPills } from "./build-skill-pills";
import { isCopyableSkillSource } from "./is-copyable-skill-source";
import {
  extensionModuleCardInteractiveClassName,
  extensionModuleCardSurfaceClassName,
} from "#/utils/extension-module-card-classes";

const SHADOWED_SKILL_MESSAGE_KEY = {
  handwritten: I18nKey.SETTINGS$SKILLS_SHADOWED_HANDWRITTEN,
  duplicate_name: I18nKey.SETTINGS$SKILLS_SHADOWED_DUPLICATE_NAME,
} as const;

function shadowedSkillMessageKey(skill: SkillInfo): I18nKey | null {
  if (skill.availability !== "shadowed" || !skill.shadow_reason) {
    return null;
  }
  return SHADOWED_SKILL_MESSAGE_KEY[skill.shadow_reason];
}

interface SkillCardProps {
  skill: SkillInfo;
  enabled: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
  isToggleDisabled?: boolean;
}

export function SkillCard({
  skill,
  enabled,
  onOpen,
  onToggle,
  isToggleDisabled = false,
}: SkillCardProps) {
  const { t } = useTranslation("openhands");
  const [sourceCopied, setSourceCopied] = React.useState(false);

  const description = getSkillCardDescription(skill);
  const pills = React.useMemo(() => buildSkillPills(skill, t), [skill, t]);
  const showCopySource = isCopyableSkillSource(skill.source);
  const isShadowed = skill.availability === "shadowed";
  const shadowMessageKey = shadowedSkillMessageKey(skill);

  const handleCopySource = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!skill.source) {
      return;
    }

    await navigator.clipboard.writeText(skill.source);
    setSourceCopied(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  React.useEffect(() => {
    if (!sourceCopied) {
      return undefined;
    }

    const timeout = setTimeout(() => setSourceCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [sourceCopied]);

  return (
    <div
      data-testid={
        isShadowed
          ? `skill-not-loaded-${skill.name}`
          : `skill-card-${skill.name}`
      }
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex min-w-0 flex-col gap-3 overflow-hidden p-4",
        extensionModuleCardSurfaceClassName,
        extensionModuleCardInteractiveClassName,
      )}
    >
      <div className="flex items-start gap-3">
        <SkillIconBadge skillName={skill.name} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3
                data-testid={`skill-name-${skill.name}`}
                className="truncate text-sm font-semibold text-contrast"
              >
                {skill.name}
              </h3>
              {skill.source ? (
                <div className="mt-0.5 flex min-w-0 items-center gap-1">
                  <p
                    data-testid={`skill-source-${skill.name}`}
                    className="min-w-0 flex-1 truncate text-xs text-tertiary-alt"
                    title={skill.source}
                  >
                    {skill.source}
                  </p>
                  {showCopySource ? (
                    <button
                      type="button"
                      data-testid={`skill-copy-source-${skill.name}`}
                      aria-label={t(
                        sourceCopied
                          ? I18nKey.BUTTON$COPIED
                          : I18nKey.SETTINGS$SKILLS_COPY_PATH,
                      )}
                      disabled={sourceCopied}
                      onClick={handleCopySource}
                      className="shrink-0 cursor-pointer border-0 bg-transparent p-0.5 text-tertiary-alt hover:text-contrast disabled:cursor-default [&_path]:fill-current"
                    >
                      {sourceCopied ? (
                        <CheckmarkIcon width={12} height={12} />
                      ) : (
                        <CopyIcon width={12} height={12} />
                      )}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <CirclePlusCheckToggle
              testId={`skill-toggle-${skill.name}`}
              isSelected={enabled}
              onToggle={onToggle}
              isDisabled={isToggleDisabled || isShadowed}
              disableTooltipKey={I18nKey.COMMON$DISABLE}
            />
          </header>

          {description ? (
            <div
              data-testid={`skill-description-${skill.name}`}
              className="min-w-0"
            >
              <p className="line-clamp-2 break-words text-xs leading-relaxed text-tertiary-light">
                {description}
              </p>
            </div>
          ) : null}

          {shadowMessageKey ? (
            <p className="break-words text-xs leading-relaxed text-tertiary-light">
              {t(shadowMessageKey)}
            </p>
          ) : null}

          {pills.length > 0 ? (
            <SkillCardPillRow
              pills={pills}
              testId={`skill-triggers-${skill.name}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
