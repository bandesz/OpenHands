import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsSettingsScreen from "#/routes/skills-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import SkillsService from "#/api/skills-service";
import SkillsRepositoryService from "#/api/skills-repository-service";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { HttpError } from "@openhands/typescript-client";
import type { SkillsRepository } from "@openhands/typescript-client/clients";
import {
  ADD_SKILL_DOCS_URL,
  ADD_SKILL_EXAMPLE_COMMAND,
} from "#/constants/skills-docs";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings, SkillInfo } from "#/types/settings";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

const navigateMock = vi.fn();
let migrationState: {
  isFetching: boolean;
  isSuccess: boolean;
  error: unknown;
} = { isFetching: false, isSuccess: true, error: null };
vi.mock(
  "#/hooks/use-migrate-default-agent-profile",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("#/hooks/use-migrate-default-agent-profile")
    >()),
    useMigrateDefaultAgentProfile: () => migrationState,
  }),
);
const updateDefaultAgentProfileMock = vi.hoisted(() => vi.fn());
vi.mock("#/hooks/mutation/sync-agent-profiles", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("#/hooks/mutation/sync-agent-profiles")
  >()),
  updateDefaultAgentProfile: updateDefaultAgentProfileMock,
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({
    navigate: navigateMock,
    currentPath: "/skills",
    conversationId: null,
    isNavigating: false,
  }),
  NavigationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
      ...overrides.agent_settings,
    },
  };
}

// The local page lists the server catalog; Cloud lists its own skills.
function mockSkillList(skills: SkillInfo[]) {
  vi.spyOn(SkillsService, "getSkills").mockResolvedValue(skills);
  vi.spyOn(SkillsService, "getSkillCatalog").mockResolvedValue(skills);
}

const REPOSITORY_COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567";
const REPOSITORY_CHECKOUT_PATH = "/Users/me/.openhands/skills-repository";

function absentSkillsRepository(): SkillsRepository {
  return {
    url: null,
    status: "absent",
    commit_sha: null,
    checkout_path: null,
    container_path: null,
    error_code: null,
    error: null,
  };
}

function readySkillsRepository(url: string): SkillsRepository {
  return {
    url,
    status: "ready",
    commit_sha: REPOSITORY_COMMIT_SHA,
    checkout_path: REPOSITORY_CHECKOUT_PATH,
    container_path: "/opt/openhands/skills-repository",
    error_code: null,
    error: null,
  };
}

function buildSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "deno",
    type: "knowledge",
    source:
      "/Users/test/.openhands/cache/skills/public-skills/skills/deno/SKILL.md",
    description:
      "If the project uses deno, use this skill to initialize Deno projects.",
    triggers: ["deno", "deno.json", "deno.lock"],
    version: "1.0.0",
    license: "Apache-2.0",
    compatibility: "Requires Deno 1.40+",
    metadata: null,
    allowed_tools: ["bash"],
    is_agentskills_format: true,
    disable_model_invocation: false,
    ...overrides,
  };
}

function renderSkillsSettingsScreen(
  initialEntry = "/skills",
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  const router = createMemoryRouter(
    [
      {
        path: "/skills",
        Component: () => (
          <ActiveBackendProvider>
            <SkillsSettingsScreen />
          </ActiveBackendProvider>
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  );

  render(<RouterProvider router={router} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return router;
}

describe("SkillsSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigateMock.mockReset();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());
    migrationState = { isFetching: false, isSuccess: true, error: null };
    // No OpenHands `default`: the page keeps its lists in settings.
    vi.spyOn(AgentProfilesService, "getProfile").mockRejectedValue(
      new HttpError(404, "Not Found", {}, "missing"),
    );
    vi.spyOn(SkillsRepositoryService, "get").mockResolvedValue(
      absentSkillsRepository(),
    );
  });

  it("renders the description text inside the description badge", async () => {
    mockSkillList([]);

    renderSkillsSettingsScreen();

    const description = await screen.findByTestId(
      "skills-settings-description",
    );
    expect(description).toHaveTextContent("SETTINGS$SKILLS_PAGE_DESCRIPTION");
    expect(screen.getByText("NAV$CUSTOMIZE")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-extensions-/skills")).toHaveTextContent(
      "Skills",
    );
    expect(screen.getByTestId("sidebar-extensions-/plugins")).toHaveTextContent(
      "Plugins",
    );
    expect(screen.getByTestId("sidebar-extensions-/mcp")).toHaveTextContent(
      "MCP Servers",
    );
  });

  it("shows card subtitle text from skill content when description is omitted", async () => {
    const skill = buildSkill({
      name: "SSH Microagent",
      description: null,
      content: `---
description: Connect and run commands on remote machines over SSH.
---
# SSH Microagent

Full skill body.`,
      triggers: ["ssh"],
    });
    mockSkillList([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    expect(
      within(card).getByTestId(`skill-description-${skill.name}`),
    ).toHaveTextContent(
      "Connect and run commands on remote machines over SSH.",
    );
  });

  it("surfaces the YAML description under the card title with the source path beneath it", async () => {
    const skill = buildSkill();
    mockSkillList([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    expect(
      within(card).getByTestId(`skill-description-${skill.name}`),
    ).toHaveTextContent(skill.description!);
    expect(
      within(card).getByTestId(`skill-source-${skill.name}`),
    ).toHaveTextContent(skill.source!);
    expect(
      within(card).getByTestId(`skill-icon-${skill.name}`),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId("skill-type-badge-knowledge"),
    ).toHaveTextContent("SETTINGS$SKILLS_TYPE_KNOWLEDGE");
  });

  it("copies the source path when the copy button is clicked", async () => {
    const user = userEvent.setup();
    const skill = buildSkill();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    mockSkillList([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    await user.click(
      within(card).getByTestId(`skill-copy-source-${skill.name}`),
    );

    expect(writeText).toHaveBeenCalledWith(skill.source);
  });

  it("hides the copy button when the source is a scope label instead of a path", async () => {
    const skill = buildSkill({ name: "add_repo_inst", source: "global" });
    mockSkillList([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    expect(
      within(card).getByTestId(`skill-source-${skill.name}`),
    ).toHaveTextContent("global");
    expect(
      within(card).queryByTestId(`skill-copy-source-${skill.name}`),
    ).not.toBeInTheDocument();
  });

  it("filters skills by name, description, or trigger via the search input", async () => {
    mockSkillList([
      buildSkill({ name: "deno", description: "Deno runtime helper" }),
      buildSkill({
        name: "vercel",
        description: "Preview deployment helper",
        triggers: ["vercel", "preview deployment"],
        source: "/skills/vercel/SKILL.md",
      }),
    ]);

    renderSkillsSettingsScreen();
    await screen.findByTestId("skill-card-deno");

    fireEvent.change(screen.getByTestId("skills-search-input"), {
      target: { value: "preview" },
    });

    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-vercel")).toBeInTheDocument();
  });

  it("narrows the visible skills when a facet row is selected", async () => {
    const user = userEvent.setup();
    mockSkillList([
      buildSkill({ name: "deno", type: "knowledge" }),
      buildSkill({
        name: "global-rules",
        type: "repo",
        triggers: [],
        source: "/skills/global-rules.md",
      }),
    ]);

    const router = renderSkillsSettingsScreen();
    await screen.findByTestId("skill-card-deno");

    await user.click(screen.getByTestId("skill-facet-type-repo"));

    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-global-rules")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?type=repo");
  });

  it("seeds the filter state from the URL on load", async () => {
    mockSkillList([
      buildSkill({ name: "deno", category: "environment" }),
      buildSkill({ name: "prd", category: "writing", triggers: [] }),
    ]);

    renderSkillsSettingsScreen("/skills?category=writing");

    await screen.findByTestId("skill-card-prd");
    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
  });

  it("restores the search text when history navigation changes the query", async () => {
    const user = userEvent.setup();
    mockSkillList([
      buildSkill({ name: "deno", type: "knowledge", description: "A helper" }),
      buildSkill({
        name: "global-rules",
        type: "repo",
        description: "A helper",
        triggers: [],
        source: "/skills/global-rules.md",
      }),
    ]);

    const router = renderSkillsSettingsScreen("/skills?q=helper");
    await screen.findByTestId("skill-card-deno");
    const search = screen.getByTestId("skills-search-input");

    // Push a second entry, then drop the query from it, so going back lands on a URL whose `q` differs from the input.
    await user.click(screen.getByTestId("skill-facet-type-repo"));
    fireEvent.change(search, { target: { value: "" } });
    await waitFor(() =>
      expect(router.state.location.search).toBe("?type=repo"),
    );

    await act(() => router.navigate(-1));

    await waitFor(() => expect(search).toHaveValue("helper"));
    expect(router.state.location.search).toBe("?q=helper");
  });

  it("filters through the mobile filters modal", async () => {
    const user = userEvent.setup();
    mockSkillList([
      buildSkill({ name: "deno", type: "knowledge" }),
      buildSkill({
        name: "global-rules",
        type: "repo",
        triggers: [],
        source: "/skills/global-rules.md",
      }),
    ]);

    renderSkillsSettingsScreen();
    await screen.findByTestId("skill-card-deno");

    await user.click(screen.getByTestId("skills-filters-button"));
    const modal = await screen.findByTestId("skill-filters-modal");
    await user.click(within(modal).getByTestId("skill-facet-type-repo"));

    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-global-rules")).toBeInTheDocument();
  });

  it("opens a detail modal with full metadata when a skill card is clicked", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({
      name: "rich",
      license: "MIT",
      compatibility: "Requires Python 3.11+",
      allowed_tools: ["bash", "execute_bash"],
      source: "/skills/rich/SKILL.md",
    });
    mockSkillList([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    await user.click(card);

    const modal = await screen.findByTestId("skill-detail-modal");
    expect(modal).toHaveAttribute("data-skill-name", skill.name);
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-license`),
    ).toHaveTextContent("MIT");
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-compatibility`),
    ).toHaveTextContent("Requires Python 3.11+");
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-tool-bash`),
    ).toHaveTextContent("bash");
    expect(
      within(modal).getByTestId(
        `skill-modal-pill-${skill.name}-tool-execute_bash`,
      ),
    ).toHaveTextContent("execute_bash");
    expect(
      within(modal).getByTestId(`skill-modal-toggle-${skill.name}`),
    ).toBeInTheDocument();
  });

  it("toggles a skill from the detail modal", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({ name: "toggle-me" });
    mockSkillList([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);
    await user.click(card);

    const modal = await screen.findByTestId("skill-detail-modal");
    expect(
      within(modal).getByText("SETTINGS$SKILLS_ENABLED"),
    ).toBeInTheDocument();

    await user.click(
      within(modal).getByTestId(`skill-modal-toggle-${skill.name}`),
    );

    expect(card).not.toHaveClass("opacity-70");
    expect(
      within(card).getByTestId(`skill-toggle-${skill.name}`),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      within(modal).getByText("SETTINGS$SKILLS_DISABLED"),
    ).toBeInTheDocument();
  });

  it("saves disabled_skills to the server when a skill is toggled off and settings has no prior disabled_skills field", async () => {
    // Reproduces the bug where disabled_skills is absent from settings (undefined),
    // causing hasHydratedInitialSettings to never become true and the save to be silently skipped.
    const user = userEvent.setup();
    const skill = buildSkill({ name: "save-me" });
    mockSkillList([skill]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ disabled_skills: undefined }),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    await screen.findByTestId(`skill-card-${skill.name}`);
    const card = screen.getByTestId(`skill-card-${skill.name}`);

    await user.click(within(card).getByTestId(`skill-toggle-${skill.name}`));

    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ disabled_skills: [skill.name] }),
      ),
    );
  });

  it("saves an updated disabled list when a skill is toggled off and settings already has disabled_skills", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({ name: "another-skill" });
    mockSkillList([skill]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ disabled_skills: [] }),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    await screen.findByTestId(`skill-card-${skill.name}`);
    const card = screen.getByTestId(`skill-card-${skill.name}`);

    await user.click(within(card).getByTestId(`skill-toggle-${skill.name}`));

    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ disabled_skills: [skill.name] }),
      ),
    );
  });

  it("toggles a skill from the card without opening the modal", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({ name: "card-toggle" });
    mockSkillList([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    await user.click(within(card).getByTestId(`skill-toggle-${skill.name}`));

    expect(card).not.toHaveClass("opacity-70");
    expect(
      within(card).getByTestId(`skill-toggle-${skill.name}`),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByTestId("skill-detail-modal")).not.toBeInTheDocument();
  });

  it("keeps same-name local and bundled skills distinct while search and facets change", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockSkillList([
      buildSkill({
        name: "skill-creator",
        type: "knowledge",
        source: "/Users/test/.openhands/skills/skill-creator/SKILL.md",
      }),
      buildSkill({
        name: "skill-creator",
        type: "repo",
        triggers: [],
        source: "public",
      }),
      buildSkill({
        name: "deno",
        source: "/skills/deno/SKILL.md",
      }),
    ]);

    renderSkillsSettingsScreen();
    await waitFor(() =>
      expect(screen.getAllByTestId("skill-card-skill-creator")).toHaveLength(2),
    );

    const search = screen.getByTestId("skills-search-input");
    for (let round = 0; round < 3; round += 1) {
      fireEvent.change(search, { target: { value: "creator" } });
      await waitFor(() =>
        expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument(),
      );
      expect(screen.getAllByTestId("skill-card-skill-creator")).toHaveLength(2);

      await user.click(screen.getByTestId("skill-facet-type-repo"));
      await waitFor(() =>
        expect(screen.getAllByTestId("skill-card-skill-creator")).toHaveLength(
          1,
        ),
      );

      await user.click(screen.getByTestId("skill-facet-type-repo"));
      await waitFor(() =>
        expect(screen.getAllByTestId("skill-card-skill-creator")).toHaveLength(
          2,
        ),
      );

      fireEvent.change(search, { target: { value: "" } });
      await screen.findByTestId("skill-card-deno");
      expect(screen.getAllByTestId("skill-card-skill-creator")).toHaveLength(2);
    }

    const duplicateKeyWarnings = consoleError.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("same key")),
    );
    expect(duplicateKeyWarnings).toHaveLength(0);
  });

  it("shows an empty-state message when no skills match the current filters", async () => {
    const skill = buildSkill();
    mockSkillList([skill]);

    renderSkillsSettingsScreen();
    await screen.findByTestId(`skill-card-${skill.name}`);

    fireEvent.change(screen.getByTestId("skills-search-input"), {
      target: { value: "no-such-skill-xyz" },
    });

    expect(screen.getByTestId("skills-no-match")).toBeInTheDocument();
  });

  it("opens the add skill modal with docs link and closes it", async () => {
    const user = userEvent.setup();
    mockSkillList([]);

    renderSkillsSettingsScreen();
    await screen.findByTestId("skills-add-skill-button");

    await user.click(screen.getByTestId("skills-add-skill-button"));

    const modal = await screen.findByTestId("add-skill-modal");
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId("add-skill-modal-example")).toHaveTextContent(
      "/add-skill https://github.com/OpenHands/extensions/tree/main/skills/code-review",
    );
    expect(screen.getByTestId("add-skill-modal-docs-link")).toHaveAttribute(
      "href",
      ADD_SKILL_DOCS_URL,
    );

    await user.click(screen.getByTestId("add-skill-modal-dismiss"));

    expect(screen.queryByTestId("add-skill-modal")).not.toBeInTheDocument();
  });

  it("copies the example command from the add skill modal", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    mockSkillList([]);

    renderSkillsSettingsScreen();
    await user.click(await screen.findByTestId("skills-add-skill-button"));
    await screen.findByTestId("add-skill-modal");

    await user.click(screen.getByTestId("add-skill-modal-example-copy"));

    expect(writeText).toHaveBeenCalledWith(ADD_SKILL_EXAMPLE_COMMAND);
  });
  // A skill from the bundled `@openhands/extensions` catalog: those are
  // governed by the `enabled_skills` allow-list, not the deny-list.
  const CATALOG_RECOMMENDED = "add-skill";
  const CATALOG_OPTIONAL = "add-javadoc";

  it("lists the skills agent profiles can select on a local backend", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      buildSkill({ name: "repo-only" }),
    ]);
    vi.spyOn(SkillsService, "getSkillCatalog").mockResolvedValue([
      buildSkill({ name: "from-catalog" }),
    ]);

    renderSkillsSettingsScreen();

    expect(
      await screen.findByTestId("skill-card-from-catalog"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("skill-card-repo-only"),
    ).not.toBeInTheDocument();
  });

  it("says the selection is the default list for new agent profiles", async () => {
    mockSkillList([]);

    renderSkillsSettingsScreen();

    expect(
      await screen.findByTestId("skills-default-list-notice"),
    ).toHaveTextContent("SETTINGS$SKILLS_DEFAULT_LIST_NOTICE");
  });

  it("badges a catalog skill the catalog recommends", async () => {
    mockSkillList([
      buildSkill({ name: CATALOG_RECOMMENDED }),
      buildSkill({ name: CATALOG_OPTIONAL }),
    ]);

    renderSkillsSettingsScreen();
    await screen.findByTestId(`skill-card-${CATALOG_RECOMMENDED}`);

    expect(
      screen.getByTestId(`skill-recommended-${CATALOG_RECOMMENDED}`),
    ).toHaveTextContent("SETTINGS$SKILLS_RECOMMENDED");
    expect(
      screen.queryByTestId(`skill-recommended-${CATALOG_OPTIONAL}`),
    ).not.toBeInTheDocument();
  });

  it("renders an unlisted catalog skill as off without it being denied", async () => {
    // The reported bug: everything in the catalog arrived switched on.
    mockSkillList([buildSkill({ name: CATALOG_OPTIONAL })]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ enabled_skills: undefined, disabled_skills: [] }),
    );

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${CATALOG_OPTIONAL}`);

    expect(
      within(card).getByTestId(`skill-toggle-${CATALOG_OPTIONAL}`),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("writes nothing back when the user toggles nothing", async () => {
    // Persisting the hydrated state on mount would race the one-shot migration
    // and could narrow a workspace it had just preserved.
    mockSkillList([buildSkill({ name: CATALOG_OPTIONAL })]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ enabled_skills: undefined, disabled_skills: [] }),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    await screen.findByTestId(`skill-card-${CATALOG_OPTIONAL}`);
    await waitFor(() =>
      expect(screen.getByTestId("skills-result-summary")).toBeInTheDocument(),
    );

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("saves a catalog toggle to enabled_skills rather than the deny-list", async () => {
    const user = userEvent.setup();
    mockSkillList([buildSkill({ name: CATALOG_RECOMMENDED })]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ enabled_skills: [CATALOG_RECOMMENDED] }),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${CATALOG_RECOMMENDED}`);

    await user.click(
      within(card).getByTestId(`skill-toggle-${CATALOG_RECOMMENDED}`),
    );

    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled_skills: [],
          disabled_skills: [],
        }),
      ),
    );
  });

  it("shows and saves the default agent profile's own list", async () => {
    const user = userEvent.setup();
    updateDefaultAgentProfileMock.mockReset().mockResolvedValue(undefined);
    mockSkillList([
      buildSkill({ name: CATALOG_RECOMMENDED }),
      buildSkill({ name: CATALOG_OPTIONAL }),
    ]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ enabled_skills: [CATALOG_RECOMMENDED] }),
    );
    vi.spyOn(AgentProfilesService, "getProfile").mockResolvedValue({
      name: "default",
      profile: {
        id: "p-default",
        name: "default",
        revision: 1,
        agent_kind: "openhands",
        llm_profile_ref: "llm",
        public_skills: [CATALOG_OPTIONAL],
        disabled_skills: [],
      },
    } as never);
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    const optional = await screen.findByTestId(
      `skill-card-${CATALOG_OPTIONAL}`,
    );
    await waitFor(() =>
      expect(
        within(optional).getByTestId(`skill-toggle-${CATALOG_OPTIONAL}`),
      ).toHaveAttribute("aria-checked", "true"),
    );
    expect(
      screen.getByTestId(`skill-toggle-${CATALOG_RECOMMENDED}`),
    ).toHaveAttribute("aria-checked", "false");

    await user.click(
      within(optional).getByTestId(`skill-toggle-${CATALOG_OPTIONAL}`),
    );

    await waitFor(() =>
      expect(updateDefaultAgentProfileMock).toHaveBeenCalledOnce(),
    );
    const [, change] = updateDefaultAgentProfileMock.mock.calls[0];
    expect(
      change({
        agent_kind: "openhands",
        public_skills: [CATALOG_OPTIONAL],
        disabled_skills: [],
      }),
    ).toEqual({ public_skills: [], disabled_skills: [] });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("keeps a second quick toggle while the first write's refetch lands", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const releases: (() => void)[] = [];
    updateDefaultAgentProfileMock.mockReset().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );
    mockSkillList([
      buildSkill({ name: CATALOG_RECOMMENDED }),
      buildSkill({ name: CATALOG_OPTIONAL }),
    ]);
    const stored = (publicSkills: string[]) =>
      ({
        name: "default",
        profile: {
          id: "p-default",
          name: "default",
          revision: 1,
          agent_kind: "openhands",
          llm_profile_ref: "llm",
          public_skills: publicSkills,
          disabled_skills: [],
        },
      }) as never;
    const getProfile = vi
      .spyOn(AgentProfilesService, "getProfile")
      .mockResolvedValue(stored([]));

    renderSkillsSettingsScreen("/skills", queryClient);
    const first = await screen.findByTestId(
      `skill-toggle-${CATALOG_RECOMMENDED}`,
    );
    await waitFor(() => expect(first).toHaveAttribute("aria-checked", "false"));
    await user.click(first);
    await user.click(screen.getByTestId(`skill-toggle-${CATALOG_OPTIONAL}`));

    // The first write lands and its refetch returns only the first toggle.
    getProfile.mockResolvedValue(stored([CATALOG_RECOMMENDED]));
    await act(() => queryClient.invalidateQueries());

    expect(
      screen.getByTestId(`skill-toggle-${CATALOG_OPTIONAL}`),
    ).toHaveAttribute("aria-checked", "true");
    await act(async () => releases.forEach((release) => release()));
  });

  it("writes nowhere when the default profile cannot be read", async () => {
    const user = userEvent.setup();
    updateDefaultAgentProfileMock.mockReset().mockResolvedValue(undefined);
    mockSkillList([buildSkill({ name: CATALOG_RECOMMENDED })]);
    vi.spyOn(AgentProfilesService, "getProfile").mockRejectedValue(
      new HttpError(500, "Server Error", {}, "boom"),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    const toggle = await screen.findByTestId(
      `skill-toggle-${CATALOG_RECOMMENDED}`,
    );
    await waitFor(() => expect(toggle).toBeDisabled());
    await user.click(toggle);

    expect(saveSpy).not.toHaveBeenCalled();
    expect(updateDefaultAgentProfileMock).not.toHaveBeenCalled();
  });

  it("locks the switches while the default profile's migration has failed", async () => {
    const user = userEvent.setup();
    updateDefaultAgentProfileMock.mockReset().mockResolvedValue(undefined);
    migrationState = {
      isFetching: false,
      isSuccess: false,
      error: new Error("offline"),
    };
    mockSkillList([buildSkill({ name: CATALOG_RECOMMENDED })]);
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    const toggle = await screen.findByTestId(
      `skill-toggle-${CATALOG_RECOMMENDED}`,
    );
    await waitFor(() => expect(toggle).toBeDisabled());
    await user.click(toggle);

    expect(saveSpy).not.toHaveBeenCalled();
    expect(updateDefaultAgentProfileMock).not.toHaveBeenCalled();
  });

  it("drops a re-enabled catalog skill from an unmigrated deny-list", async () => {
    // A stale deny entry would otherwise veto the allow-list entry we just
    // wrote, leaving the toggle on and the skill still absent.
    const user = userEvent.setup();
    mockSkillList([buildSkill({ name: CATALOG_RECOMMENDED })]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        enabled_skills: undefined,
        disabled_skills: [CATALOG_RECOMMENDED],
      }),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${CATALOG_RECOMMENDED}`);

    await user.click(
      within(card).getByTestId(`skill-toggle-${CATALOG_RECOMMENDED}`),
    );

    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled_skills: expect.arrayContaining([CATALOG_RECOMMENDED]),
          disabled_skills: [],
        }),
      ),
    );
  });

  it("hides the skills repository panel on a cloud backend", async () => {
    __resetActiveStoreForTests();
    setRegisteredBackends([
      {
        id: "cloud-1",
        name: "Cloud",
        host: "https://app.example.com",
        apiKey: "key",
        kind: "cloud",
      },
    ]);
    setActiveSelection({ backendId: "cloud-1", orgId: null });
    mockSkillList([]);

    try {
      renderSkillsSettingsScreen();

      await screen.findByTestId("skills-empty");
      expect(
        screen.queryByTestId("skills-repository-panel"),
      ).not.toBeInTheDocument();
      expect(SkillsRepositoryService.get).not.toHaveBeenCalled();
    } finally {
      window.localStorage.clear();
      __resetActiveStoreForTests();
    }
  });

  it("connects a repository and shows its skills on the same page", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    const reviewSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    let repository = absentSkillsRepository();
    let catalog: SkillInfo[] = [];
    let resolveInitialGet: (value: SkillsRepository) => void = () => {};
    const initialGet = new Promise<SkillsRepository>((resolve) => {
      resolveInitialGet = resolve;
    });
    let awaitingInitialGet = true;
    vi.spyOn(SkillsRepositoryService, "get").mockImplementation(() =>
      awaitingInitialGet ? initialGet : Promise.resolve(repository),
    );
    vi.spyOn(SkillsService, "getSkillCatalog").mockImplementation(
      async () => catalog,
    );
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    const router = renderSkillsSettingsScreen();

    expect(screen.getByTestId("skills-repository-loading")).toBeInTheDocument();
    expect(
      screen.queryByTestId("skills-repository-url"),
    ).not.toBeInTheDocument();

    awaitingInitialGet = false;
    resolveInitialGet(repository);

    const urlField = await screen.findByTestId("skills-repository-url");
    const saveButton = screen.getByTestId("skills-repository-save");
    expect(urlField).toHaveValue("");
    expect(saveButton).toBeDisabled();
    expect(
      screen.queryByTestId("skills-repository-sync"),
    ).not.toBeInTheDocument();

    await user.type(urlField, repositoryUrl);
    expect(saveButton).toBeEnabled();

    let resolveSave: () => void = () => {};
    const saveGate = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const saveSpy = vi
      .spyOn(SkillsRepositoryService, "save")
      .mockImplementation(async (url: string) => {
        await saveGate;
        repository = readySkillsRepository(url);
        catalog = [
          buildSkill({
            name: "review",
            origin: "user",
            source: reviewSource,
            description: "Review the change.",
            triggers: ["review-please"],
          }),
        ];
        return repository;
      });

    await user.click(saveButton);

    expect(saveSpy).toHaveBeenCalledWith(repositoryUrl);
    expect(screen.getByTestId("skills-repository-status")).toHaveTextContent(
      "SETTINGS$SKILLS_REPOSITORY_SYNCING",
    );
    expect(urlField).toBeDisabled();
    expect(saveButton).toBeDisabled();
    expect(screen.queryByTestId("skills-repository-url")).toBeInTheDocument();

    resolveSave();

    const status = await screen.findByTestId("skills-repository-status");
    await waitFor(() => {
      expect(status).toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE");
    });
    expect(status).toHaveTextContent("0123456");
    expect(screen.getByTestId("skills-repository-sync")).toBeEnabled();
    expect(urlField).toHaveValue(repositoryUrl);

    const panel = screen.getByTestId("skills-repository-panel");
    const card = await screen.findByTestId("skill-card-review");
    expect(
      panel.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(card).getByTestId("skill-source-review")).toHaveTextContent(
      reviewSource,
    );
    expect(within(card).getByTestId("skill-toggle-review")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(router.state.location.pathname).toBe("/skills");
  });

  it("says when a ready repository contains no skill folders", async () => {
    vi.spyOn(SkillsRepositoryService, "get").mockResolvedValue(
      readySkillsRepository("https://github.com/org/skills"),
    );
    mockSkillList([]);

    renderSkillsSettingsScreen();

    await waitFor(() => {
      expect(screen.getByTestId("skills-repository-panel")).toHaveTextContent(
        "SETTINGS$SKILLS_REPOSITORY_NO_SKILLS",
      );
    });
    const panel = screen.getByTestId("skills-repository-panel");
    const status = within(panel).getByTestId("skills-repository-status");
    expect(status).toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE");
    expect(status).toHaveTextContent("0123456");
    expect(
      panel.compareDocumentPosition(screen.getByTestId("skills-empty")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("skills-repository-url")).toHaveValue(
      "https://github.com/org/skills",
    );
  });

  it("keeps save disabled until the URL is an http, https, or ssh git URL", async () => {
    const user = userEvent.setup();
    mockSkillList([]);

    renderSkillsSettingsScreen();

    const urlField = await screen.findByTestId("skills-repository-url");
    const saveButton = screen.getByTestId("skills-repository-save");
    expect(saveButton).toBeDisabled();
    expect(urlField).toHaveAccessibleDescription(
      "SETTINGS$SKILLS_REPOSITORY_INVALID_URL",
    );

    await user.type(urlField, "not a url");
    expect(saveButton).toBeDisabled();
    expect(urlField).toHaveAccessibleDescription(
      "SETTINGS$SKILLS_REPOSITORY_INVALID_URL",
    );

    await user.clear(urlField);
    await user.type(urlField, "https://github.com/org/skills");
    expect(saveButton).toBeEnabled();
    expect(urlField).not.toHaveAccessibleDescription(
      "SETTINGS$SKILLS_REPOSITORY_INVALID_URL",
    );

    await user.clear(urlField);
    await user.type(urlField, "git@github.com:org/skills.git");
    expect(saveButton).toBeEnabled();
    expect(urlField).not.toHaveAccessibleDescription(
      "SETTINGS$SKILLS_REPOSITORY_INVALID_URL",
    );

    await user.clear(urlField);
    await user.type(urlField, "ssh://git@github.com/org/skills.git");
    expect(saveButton).toBeEnabled();
  });

  it("keeps save disabled for a credential URL and a token query", async () => {
    const user = userEvent.setup();
    mockSkillList([]);

    renderSkillsSettingsScreen();

    const urlField = await screen.findByTestId("skills-repository-url");
    const saveButton = screen.getByTestId("skills-repository-save");

    await user.type(urlField, "https://user:token@github.com/org/skills.git");
    expect(saveButton).toBeDisabled();
    expect(urlField).toHaveAccessibleDescription(
      "SETTINGS$SKILLS_REPOSITORY_INVALID_URL",
    );

    await user.clear(urlField);
    await user.type(urlField, "https://github.com/org/skills.git?token=secret");
    expect(saveButton).toBeDisabled();
    expect(urlField).toHaveAccessibleDescription(
      "SETTINGS$SKILLS_REPOSITORY_INVALID_URL",
    );
  });

  it("keeps save disabled when a query name contains a secret word", async () => {
    const user = userEvent.setup();
    mockSkillList([]);

    renderSkillsSettingsScreen();

    const urlField = await screen.findByTestId("skills-repository-url");
    const saveButton = screen.getByTestId("skills-repository-save");

    await user.type(urlField, "https://host/repo.git?password=secret");
    expect(saveButton).toBeDisabled();
    expect(urlField).toHaveAccessibleDescription(
      "SETTINGS$SKILLS_REPOSITORY_INVALID_URL",
    );

    await user.clear(urlField);
    await user.type(urlField, "https://host/repo.git?private_token=secret");
    expect(saveButton).toBeDisabled();
    expect(urlField).toHaveAccessibleDescription(
      "SETTINGS$SKILLS_REPOSITORY_INVALID_URL",
    );
  });

  it("shows a 400 invalid URL error the same way as a failed save", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    const serverError = "Enter an http, https, or ssh git URL.";
    mockSkillList([]);
    vi.spyOn(SkillsRepositoryService, "save").mockRejectedValue(
      Object.assign(new Error("HTTP 400"), {
        status: 400,
        error: serverError,
        error_code: "invalid_url",
      }),
    );

    renderSkillsSettingsScreen();

    const urlField = await screen.findByTestId("skills-repository-url");
    await user.type(urlField, repositoryUrl);
    await user.click(screen.getByTestId("skills-repository-save"));

    const status = await screen.findByTestId("skills-repository-status");
    expect(status).toHaveTextContent(serverError);
    expect(urlField).toHaveValue(repositoryUrl);
    expect(screen.queryByTestId("skill-card-review")).not.toBeInTheDocument();
  });

  it("shows a failed first save until a later save succeeds", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    const serverError =
      "Authentication failed for https://github.com/org/skills";
    const reviewSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    let repository = absentSkillsRepository();
    let catalog: SkillInfo[] = [];
    const getSpy = vi
      .spyOn(SkillsRepositoryService, "get")
      .mockImplementation(() => Promise.resolve(repository));
    const catalogSpy = vi
      .spyOn(SkillsService, "getSkillCatalog")
      .mockImplementation(async () => catalog);
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);
    const saveSpy = vi
      .spyOn(SkillsRepositoryService, "save")
      .mockRejectedValueOnce(
        Object.assign(new Error("HTTP 422"), {
          error: serverError,
          error_code: "git_failed",
        }),
      );

    renderSkillsSettingsScreen();

    const urlField = await screen.findByTestId("skills-repository-url");
    await user.type(urlField, repositoryUrl);
    const getsBeforeSave = getSpy.mock.calls.length;
    const catalogsBeforeSave = catalogSpy.mock.calls.length;

    await user.click(screen.getByTestId("skills-repository-save"));

    const status = await screen.findByTestId("skills-repository-status");
    expect(status).toHaveTextContent(serverError);
    expect(status).not.toHaveTextContent(
      "SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE",
    );
    expect(urlField).toHaveValue(repositoryUrl);
    expect(screen.queryByTestId("skill-card-review")).not.toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledTimes(getsBeforeSave);
    expect(catalogSpy).toHaveBeenCalledTimes(catalogsBeforeSave);
    expect(saveSpy).toHaveBeenCalledTimes(1);

    saveSpy.mockImplementation(async (url: string) => {
      repository = readySkillsRepository(url);
      catalog = [
        buildSkill({
          name: "review",
          origin: "user",
          source: reviewSource,
          description: "Review the change.",
          triggers: ["review-please"],
        }),
      ];
      return repository;
    });
    await user.click(screen.getByTestId("skills-repository-save"));

    await waitFor(() => {
      const savedStatus = screen.getByTestId("skills-repository-status");
      expect(savedStatus).toHaveTextContent(
        "SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE",
      );
      expect(savedStatus).not.toHaveTextContent(serverError);
      expect(savedStatus).toHaveTextContent("0123456");
    });
    expect(urlField).toHaveValue(repositoryUrl);
    expect(
      within(await screen.findByTestId("skill-card-review")).getByTestId(
        "skill-source-review",
      ),
    ).toHaveTextContent(reviewSource);
  });

  it("clears a failed first save when the URL is edited", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    const serverError = "Repository not found";
    mockSkillList([]);
    vi.spyOn(SkillsRepositoryService, "save").mockRejectedValue(
      Object.assign(new Error("HTTP 422"), {
        error: serverError,
        error_code: "git_failed",
      }),
    );

    renderSkillsSettingsScreen();

    const urlField = await screen.findByTestId("skills-repository-url");
    await user.type(urlField, repositoryUrl);
    await user.click(screen.getByTestId("skills-repository-save"));

    expect(
      await screen.findByTestId("skills-repository-status"),
    ).toHaveTextContent(serverError);

    await user.type(urlField, "x");

    expect(screen.queryByText(serverError)).not.toBeInTheDocument();
    expect(urlField).toHaveValue(`${repositoryUrl}x`);
    expect(screen.queryByTestId("skill-card-review")).not.toBeInTheDocument();
  });

  it("keeps the connected repository when a replacement save fails", async () => {
    const user = userEvent.setup();
    const urlA = "https://github.com/org/skills";
    const urlB = "https://github.com/org/other-skills";
    const serverError = "Could not clone https://github.com/org/other-skills";
    const reviewSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    const getSpy = vi
      .spyOn(SkillsRepositoryService, "get")
      .mockResolvedValue(readySkillsRepository(urlA));
    const catalogSpy = vi
      .spyOn(SkillsService, "getSkillCatalog")
      .mockResolvedValue([
        buildSkill({
          name: "review",
          origin: "user",
          source: reviewSource,
          description: "Review the change.",
          triggers: ["review-please"],
        }),
      ]);
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);
    vi.spyOn(SkillsRepositoryService, "save").mockRejectedValue(
      Object.assign(new Error("HTTP 422"), {
        error: serverError,
        error_code: "git_failed",
      }),
    );

    renderSkillsSettingsScreen();

    const urlField = await screen.findByTestId("skills-repository-url");
    expect(urlField).toHaveValue(urlA);
    const card = await screen.findByTestId("skill-card-review");
    expect(within(card).getByTestId("skill-source-review")).toHaveTextContent(
      reviewSource,
    );
    const getsBeforeSave = getSpy.mock.calls.length;
    const catalogsBeforeSave = catalogSpy.mock.calls.length;

    await user.clear(urlField);
    await user.type(urlField, urlB);
    await user.click(screen.getByTestId("skills-repository-save"));

    const status = await screen.findByTestId("skills-repository-status");
    expect(status).toHaveTextContent(serverError);
    expect(status).toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE");
    expect(status).toHaveTextContent("0123456");
    expect(urlField).toHaveValue(urlB);
    expect(within(card).getByTestId("skill-source-review")).toHaveTextContent(
      reviewSource,
    );
    expect(getSpy).toHaveBeenCalledTimes(getsBeforeSave);
    expect(catalogSpy).toHaveBeenCalledTimes(catalogsBeforeSave);

    await user.type(urlField, "x");
    expect(status).not.toHaveTextContent(serverError);
    expect(status).toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE");
    expect(status).toHaveTextContent("0123456");
    expect(urlField).toHaveValue(`${urlB}x`);
    expect(screen.getByTestId("skill-card-review")).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledTimes(getsBeforeSave);
  });

  it("syncs a repository and shows the updated review description", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    const reviewSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    const updatedSha = "89abcdef0123456789abcdef0123456789abcdef";
    let repository = readySkillsRepository(repositoryUrl);
    let catalog = [
      buildSkill({
        name: "review",
        origin: "user",
        source: reviewSource,
        description: "Review the change.",
        triggers: ["review-please"],
      }),
    ];
    vi.spyOn(SkillsRepositoryService, "get").mockImplementation(() =>
      Promise.resolve(repository),
    );
    vi.spyOn(SkillsService, "getSkillCatalog").mockImplementation(
      async () => catalog,
    );
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    let resolveSync: (value: SkillsRepository) => void = () => {};
    const syncGate = new Promise<SkillsRepository>((resolve) => {
      resolveSync = resolve;
    });
    const syncSpy = vi
      .spyOn(SkillsRepositoryService, "sync")
      .mockImplementation(() => syncGate);

    renderSkillsSettingsScreen();

    expect(
      await screen.findByTestId("skill-description-review"),
    ).toHaveTextContent("Review the change.");
    await user.click(screen.getByTestId("skills-repository-sync"));

    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("skills-repository-status")).toHaveTextContent(
      "SETTINGS$SKILLS_REPOSITORY_SYNCING",
    );

    repository = { ...repository, commit_sha: updatedSha };
    catalog = [
      buildSkill({
        name: "review",
        origin: "user",
        source: reviewSource,
        description: "Review the updated change.",
        triggers: ["review-please"],
      }),
    ];
    resolveSync(repository);

    const status = await screen.findByTestId("skills-repository-status");
    await waitFor(() => {
      expect(status).toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE");
      expect(status).toHaveTextContent("89abcde");
      expect(status).not.toHaveTextContent("0123456");
      expect(status).not.toHaveTextContent(
        "SETTINGS$SKILLS_REPOSITORY_SYNCING",
      );
    });
    expect(screen.getByTestId("skill-description-review")).toHaveTextContent(
      "Review the updated change.",
    );
  });

  it("shows Syncing and refetches while a startup pull is running", async () => {
    const repositoryUrl = "https://github.com/org/skills";
    const updatedSha = "89abcdef0123456789abcdef0123456789abcdef";
    let fetches = 0;
    const getSpy = vi
      .spyOn(SkillsRepositoryService, "get")
      .mockImplementation(async () => {
        fetches += 1;
        if (fetches === 1) {
          return {
            ...readySkillsRepository(repositoryUrl),
            status: "syncing",
          };
        }
        return {
          ...readySkillsRepository(repositoryUrl),
          commit_sha: updatedSha,
        };
      });
    mockSkillList([]);

    vi.useFakeTimers();
    try {
      renderSkillsSettingsScreen();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByTestId("skills-repository-status")).toHaveTextContent(
        "SETTINGS$SKILLS_REPOSITORY_SYNCING",
      );
      const callsWhileSyncing = getSpy.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_999);
      });
      expect(getSpy).toHaveBeenCalledTimes(callsWhileSyncing);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(getSpy.mock.calls.length).toBeGreaterThan(callsWhileSyncing);
      // The refetch resolves on a microtask; Query notifies on the next timer.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      const status = screen.getByTestId("skills-repository-status");
      expect(status).toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE");
      expect(status).toHaveTextContent("89abcde");

      const callsAfterReady = getSpy.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(getSpy).toHaveBeenCalledTimes(callsAfterReady);
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes the review card when a sync catalog omits it", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    const reviewSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    const updatedSha = "fedcba9876543210fedcba9876543210fedcba98";
    let repository = readySkillsRepository(repositoryUrl);
    let catalog = [
      buildSkill({
        name: "review",
        origin: "user",
        source: reviewSource,
        description: "Review the change.",
        triggers: ["review-please"],
      }),
    ];
    vi.spyOn(SkillsRepositoryService, "get").mockImplementation(() =>
      Promise.resolve(repository),
    );
    vi.spyOn(SkillsService, "getSkillCatalog").mockImplementation(
      async () => catalog,
    );
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);
    vi.spyOn(SkillsRepositoryService, "sync").mockImplementation(async () => {
      repository = { ...repository, commit_sha: updatedSha };
      catalog = [];
      return repository;
    });

    renderSkillsSettingsScreen();

    expect(await screen.findByTestId("skill-card-review")).toBeInTheDocument();
    await user.click(screen.getByTestId("skills-repository-sync"));

    await waitFor(() => {
      expect(screen.queryByTestId("skill-card-review")).not.toBeInTheDocument();
    });
    const status = screen.getByTestId("skills-repository-status");
    expect(status).toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE");
    expect(status).toHaveTextContent("fedcba9");
  });

  it("shows a dirty sync failure and keeps the previous SHA", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    const reviewSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    vi.spyOn(SkillsRepositoryService, "get").mockResolvedValue(
      readySkillsRepository(repositoryUrl),
    );
    vi.spyOn(SkillsService, "getSkillCatalog").mockResolvedValue([
      buildSkill({
        name: "review",
        origin: "user",
        source: reviewSource,
        description: "Review the change.",
        triggers: ["review-please"],
      }),
    ]);
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);
    vi.spyOn(SkillsRepositoryService, "sync").mockRejectedValue(
      Object.assign(new Error("HTTP 409"), {
        status: 409,
        error_code: "dirty",
        error: "Repository has local changes. Pull was not applied.",
      }),
    );

    renderSkillsSettingsScreen();

    expect(await screen.findByTestId("skill-card-review")).toBeInTheDocument();
    await user.click(screen.getByTestId("skills-repository-sync"));

    const status = screen.getByTestId("skills-repository-status");
    await waitFor(() => {
      expect(status).toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_DIRTY");
    });
    expect(status).toHaveTextContent("0123456");
    expect(status).not.toHaveTextContent(
      "SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE",
    );
    expect(screen.getByTestId("skill-description-review")).toHaveTextContent(
      "Review the change.",
    );
  });

  it("shows a git sync failure and keeps the previous SHA", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    const serverError = "Could not pull: network unreachable";
    const reviewSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    vi.spyOn(SkillsRepositoryService, "get").mockResolvedValue(
      readySkillsRepository(repositoryUrl),
    );
    vi.spyOn(SkillsService, "getSkillCatalog").mockResolvedValue([
      buildSkill({
        name: "review",
        origin: "user",
        source: reviewSource,
        description: "Review the change.",
        triggers: ["review-please"],
      }),
    ]);
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);
    vi.spyOn(SkillsRepositoryService, "sync").mockRejectedValue(
      Object.assign(new Error("HTTP 422"), {
        status: 422,
        error_code: "git_failed",
        error: serverError,
      }),
    );

    renderSkillsSettingsScreen();

    expect(await screen.findByTestId("skill-card-review")).toBeInTheDocument();
    await user.click(screen.getByTestId("skills-repository-sync"));

    const status = screen.getByTestId("skills-repository-status");
    await waitFor(() => {
      expect(status).toHaveTextContent(serverError);
    });
    expect(status).toHaveTextContent("0123456");
    expect(status).not.toHaveTextContent(
      "SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE",
    );
    expect(screen.getByTestId("skill-description-review")).toHaveTextContent(
      "Review the change.",
    );
  });

  it("shows a startup pull error and the previous SHA", async () => {
    const repositoryUrl = "https://github.com/org/skills";
    const serverError = "Could not fast-forward: network unreachable";
    vi.spyOn(SkillsRepositoryService, "get").mockResolvedValue({
      ...readySkillsRepository(repositoryUrl),
      status: "error",
      error_code: "git_failed",
      error: serverError,
    });
    mockSkillList([]);

    renderSkillsSettingsScreen();

    const status = await screen.findByTestId("skills-repository-status");
    expect(status).toHaveTextContent(serverError);
    expect(status).toHaveTextContent("0123456");
    expect(status).not.toHaveTextContent(
      "SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE",
    );
    expect(screen.getByTestId("skills-repository-url")).toHaveValue(
      repositoryUrl,
    );
  });

  it("shows a failed repository load instead of the empty form", async () => {
    vi.spyOn(SkillsRepositoryService, "get").mockRejectedValue(
      new Error("Failed to fetch"),
    );
    mockSkillList([]);

    renderSkillsSettingsScreen();

    const status = await screen.findByTestId("skills-repository-status");
    expect(status).toHaveTextContent("Failed to fetch");
    expect(
      screen.queryByTestId("skills-repository-url"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("skills-repository-loading"),
    ).not.toBeInTheDocument();
  });

  it("keeps a failed replacement error until sync succeeds", async () => {
    const user = userEvent.setup();
    const urlA = "https://github.com/org/skills";
    const urlB = "https://github.com/org/other-skills";
    const saveFailure = "Could not clone https://github.com/org/other-skills";
    const updatedSha = "89abcdef0123456789abcdef0123456789abcdef";
    const reviewSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    let repository = readySkillsRepository(urlA);
    vi.spyOn(SkillsRepositoryService, "get").mockImplementation(() =>
      Promise.resolve(repository),
    );
    mockSkillList([
      buildSkill({
        name: "review",
        origin: "user",
        source: reviewSource,
        description: "Review the change.",
        triggers: ["review-please"],
      }),
    ]);
    vi.spyOn(SkillsRepositoryService, "save").mockRejectedValue(
      Object.assign(new Error("HTTP 422"), {
        error: saveFailure,
        error_code: "git_failed",
      }),
    );
    const syncSpy = vi
      .spyOn(SkillsRepositoryService, "sync")
      .mockRejectedValueOnce(
        Object.assign(new Error("HTTP 409"), {
          status: 409,
          error_code: "dirty",
          error: "Repository has local changes. Pull was not applied.",
        }),
      );

    renderSkillsSettingsScreen();

    const urlField = await screen.findByTestId("skills-repository-url");
    await user.clear(urlField);
    await user.type(urlField, urlB);
    await user.click(screen.getByTestId("skills-repository-save"));

    const status = await screen.findByTestId("skills-repository-status");
    expect(status).toHaveTextContent(saveFailure);
    expect(status).toHaveTextContent("0123456");

    await user.click(screen.getByTestId("skills-repository-sync"));

    await waitFor(() => {
      expect(status).toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_DIRTY");
    });
    expect(status).toHaveTextContent(saveFailure);
    expect(status).toHaveTextContent("0123456");
    expect(screen.getByTestId("skill-card-review")).toBeInTheDocument();

    syncSpy.mockImplementation(async () => {
      repository = { ...repository, commit_sha: updatedSha };
      return repository;
    });
    await user.click(screen.getByTestId("skills-repository-sync"));

    await waitFor(() => {
      expect(status).toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE");
      expect(status).toHaveTextContent("89abcde");
      expect(status).not.toHaveTextContent(saveFailure);
      expect(status).not.toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_DIRTY");
    });
    expect(urlField).toHaveValue(urlB);
  });

  it("shows a shadowed repository skill beside the hand-written card", async () => {
    const handwrittenSource = "~/.agents/skills/review/SKILL.md";
    const checkoutSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    vi.spyOn(SkillsRepositoryService, "get").mockResolvedValue(
      readySkillsRepository("https://github.com/org/skills"),
    );
    mockSkillList([
      buildSkill({
        name: "review",
        origin: "user",
        source: handwrittenSource,
        description: "Hand-written review notes.",
        triggers: ["review-please"],
        availability: "loaded",
      }),
      buildSkill({
        name: "review",
        origin: "user",
        source: checkoutSource,
        description: "Repository review notes.",
        triggers: ["review-please"],
        availability: "shadowed",
        shadow_reason: "handwritten",
      }),
    ]);

    renderSkillsSettingsScreen();

    const handwritten = await screen.findByTestId("skill-card-review");
    expect(
      within(handwritten).getByTestId("skill-source-review"),
    ).toHaveTextContent("~/.agents/skills/review/");
    expect(
      within(handwritten).getByTestId("skill-toggle-review"),
    ).toBeEnabled();
    expect(
      within(handwritten).getByTestId("skill-toggle-review"),
    ).toHaveAttribute("aria-checked", "true");

    const shadowed = screen.getByTestId("skill-not-loaded-review");
    expect(shadowed).toHaveTextContent("SETTINGS$SKILLS_SHADOWED_HANDWRITTEN");
    expect(within(shadowed).getByTestId("skill-toggle-review")).toBeDisabled();
    expect(screen.getAllByTestId("skill-card-review")).toHaveLength(1);
  });

  it("does not turn the loaded skill off from a shadowed card or its modal", async () => {
    const user = userEvent.setup();
    const handwrittenSource = "~/.agents/skills/review/SKILL.md";
    const checkoutSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    vi.spyOn(SkillsRepositoryService, "get").mockResolvedValue(
      readySkillsRepository("https://github.com/org/skills"),
    );
    mockSkillList([
      buildSkill({
        name: "review",
        origin: "user",
        source: handwrittenSource,
        description: "Hand-written review notes.",
        availability: "loaded",
      }),
      buildSkill({
        name: "review",
        origin: "user",
        source: checkoutSource,
        description: "Repository review notes.",
        availability: "shadowed",
        shadow_reason: "handwritten",
      }),
    ]);
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();

    const handwritten = await screen.findByTestId("skill-card-review");
    const shadowed = screen.getByTestId("skill-not-loaded-review");
    expect(within(shadowed).getByTestId("skill-toggle-review")).toBeDisabled();

    await user.click(within(shadowed).getByTestId("skill-name-review"));

    const modal = await screen.findByTestId("skill-detail-modal");
    const modalToggle = within(modal).getByTestId("skill-modal-toggle-review");
    expect(modalToggle).toBeDisabled();

    fireEvent.change(modalToggle, { target: { checked: false } });

    expect(
      within(modal).getByText("SETTINGS$SKILLS_ENABLED"),
    ).toBeInTheDocument();
    expect(
      within(handwritten).getByTestId("skill-toggle-review"),
    ).toHaveAttribute("aria-checked", "true");
    expect(saveSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        disabled_skills: expect.arrayContaining(["review"]),
      }),
    );
    expect(updateDefaultAgentProfileMock).not.toHaveBeenCalled();
  });

  it("shows a duplicate repository skill name as not loaded", async () => {
    const loadedSource = `${REPOSITORY_CHECKOUT_PATH}/alpha/SKILL.md`;
    const duplicateSource = `${REPOSITORY_CHECKOUT_PATH}/zeta/SKILL.md`;
    vi.spyOn(SkillsRepositoryService, "get").mockResolvedValue(
      readySkillsRepository("https://github.com/org/skills"),
    );
    mockSkillList([
      buildSkill({
        name: "review",
        origin: "user",
        source: loadedSource,
        description: "First checkout folder.",
        availability: "loaded",
        shadow_reason: null,
      }),
      buildSkill({
        name: "review",
        origin: "user",
        source: duplicateSource,
        description: "Later checkout folder.",
        availability: "shadowed",
        shadow_reason: "duplicate_name",
      }),
    ]);

    renderSkillsSettingsScreen();

    const loaded = await screen.findByTestId("skill-card-review");
    expect(within(loaded).getByTestId("skill-source-review")).toHaveTextContent(
      `${REPOSITORY_CHECKOUT_PATH}/alpha/`,
    );
    expect(within(loaded).getByTestId("skill-toggle-review")).toBeEnabled();
    expect(loaded).not.toHaveTextContent(
      "SETTINGS$SKILLS_SHADOWED_DUPLICATE_NAME",
    );

    const shadowed = screen.getByTestId("skill-not-loaded-review");
    expect(shadowed).toHaveTextContent(
      "SETTINGS$SKILLS_SHADOWED_DUPLICATE_NAME",
    );
    expect(shadowed).not.toHaveTextContent(
      "SETTINGS$SKILLS_SHADOWED_HANDWRITTEN",
    );
    expect(within(shadowed).getByTestId("skill-toggle-review")).toBeDisabled();
  });

  it("turns a loaded repository skill off, keeps it off after sync, and turns it back on", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    const reviewSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    const updatedSha = "89abcdef0123456789abcdef0123456789abcdef";
    let repository = readySkillsRepository(repositoryUrl);
    const loadedReview = (description: string) =>
      buildSkill({
        name: "review",
        origin: "user",
        source: reviewSource,
        description,
        triggers: ["review-please"],
        availability: "loaded",
      });
    let catalog = [loadedReview("Review the change.")];
    vi.spyOn(SkillsRepositoryService, "get").mockImplementation(() =>
      Promise.resolve(repository),
    );
    vi.spyOn(SkillsService, "getSkillCatalog").mockImplementation(
      async () => catalog,
    );
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);
    vi.spyOn(SkillsRepositoryService, "sync").mockImplementation(async () => {
      repository = { ...repository, commit_sha: updatedSha };
      catalog = [loadedReview("Review the updated change.")];
      return repository;
    });

    renderSkillsSettingsScreen();

    const card = await screen.findByTestId("skill-card-review");
    const toggle = within(card).getByTestId("skill-toggle-review");
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(within(card).getByTestId("skill-source-review")).toHaveTextContent(
      reviewSource,
    );

    await user.click(toggle);

    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ disabled_skills: ["review"] }),
      ),
    );
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByTestId("skills-repository-sync"));

    await waitFor(() => {
      expect(screen.getByTestId("skills-repository-status")).toHaveTextContent(
        "89abcde",
      );
      expect(screen.getByTestId("skill-description-review")).toHaveTextContent(
        "Review the updated change.",
      );
    });
    expect(
      within(screen.getByTestId("skill-card-review")).getByTestId(
        "skill-toggle-review",
      ),
    ).toHaveAttribute("aria-checked", "false");

    await user.click(
      within(screen.getByTestId("skill-card-review")).getByTestId(
        "skill-toggle-review",
      ),
    );

    await waitFor(() =>
      expect(saveSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ disabled_skills: [] }),
      ),
    );
    expect(
      within(screen.getByTestId("skill-card-review")).getByTestId(
        "skill-toggle-review",
      ),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("removes the repository after confirmation and keeps the hand-written skill", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    const handwrittenSource = "~/.agents/skills/review/SKILL.md";
    const shadowedSource = `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`;
    const loadedSource = `${REPOSITORY_CHECKOUT_PATH}/lint/SKILL.md`;
    const handwritten = buildSkill({
      name: "review",
      origin: "user",
      source: handwrittenSource,
      description: "Hand-written review notes.",
      triggers: ["review-please"],
      availability: "loaded",
    });
    let repository = readySkillsRepository(repositoryUrl);
    let catalog = [
      handwritten,
      buildSkill({
        name: "review",
        origin: "user",
        source: shadowedSource,
        description: "Repository review notes.",
        triggers: ["review-please"],
        availability: "shadowed",
        shadow_reason: "handwritten",
      }),
      buildSkill({
        name: "lint",
        origin: "user",
        source: loadedSource,
        description: "Repository lint notes.",
        triggers: ["lint"],
        availability: "loaded",
      }),
    ];
    vi.spyOn(SkillsRepositoryService, "get").mockImplementation(() =>
      Promise.resolve(repository),
    );
    vi.spyOn(SkillsService, "getSkillCatalog").mockImplementation(
      async () => catalog,
    );
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);
    const removeSpy = vi
      .spyOn(SkillsRepositoryService, "remove")
      .mockImplementation(async () => {
        repository = absentSkillsRepository();
        catalog = [handwritten];
      });

    renderSkillsSettingsScreen();

    const urlField = await screen.findByTestId("skills-repository-url");
    expect(urlField).toHaveValue(repositoryUrl);
    expect(screen.getByTestId("skill-card-review")).toBeInTheDocument();
    expect(screen.getByTestId("skill-not-loaded-review")).toBeInTheDocument();
    expect(screen.getByTestId("skill-card-lint")).toBeInTheDocument();

    await user.click(screen.getByTestId("skills-repository-remove"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "SETTINGS$SKILLS_REPOSITORY_REMOVE_TITLE",
    );
    expect(dialog).toHaveTextContent("SETTINGS$SKILLS_REPOSITORY_REMOVE_BODY");
    expect(
      screen.getByTestId("skills-repository-remove-confirm"),
    ).toHaveTextContent("COMMON$REMOVE");

    await user.click(screen.getByTestId("skills-repository-remove-confirm"));

    await waitFor(() => {
      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("skills-repository-url")).toHaveValue("");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("skills-repository-status"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("skill-not-loaded-review"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("skill-card-lint")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("skills-repository-remove"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-review")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("skill-card-review")).getByTestId(
        "skill-source-review",
      ),
    ).toHaveTextContent("~/.agents/skills/review/");
  });

  it("clears a dirty sync failure when the repository is removed", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    let repository = readySkillsRepository(repositoryUrl);
    vi.spyOn(SkillsRepositoryService, "get").mockImplementation(() =>
      Promise.resolve(repository),
    );
    mockSkillList([]);
    vi.spyOn(SkillsRepositoryService, "sync").mockRejectedValue(
      Object.assign(new Error("HTTP 409"), {
        status: 409,
        error_code: "dirty",
        error: "Repository has local changes. Pull was not applied.",
      }),
    );
    const removeSpy = vi
      .spyOn(SkillsRepositoryService, "remove")
      .mockImplementation(async () => {
        repository = absentSkillsRepository();
      });

    renderSkillsSettingsScreen();

    await screen.findByTestId("skills-repository-sync");
    await user.click(screen.getByTestId("skills-repository-sync"));

    await waitFor(() => {
      expect(screen.getByTestId("skills-repository-status")).toHaveTextContent(
        "SETTINGS$SKILLS_REPOSITORY_DIRTY",
      );
    });

    await user.click(screen.getByTestId("skills-repository-remove"));
    await user.click(
      await screen.findByTestId("skills-repository-remove-confirm"),
    );

    await waitFor(() => {
      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("skills-repository-url")).toHaveValue("");
    });
    expect(
      screen.queryByTestId("skills-repository-status"),
    ).not.toBeInTheDocument();
  });

  it("leaves the URL and skill cards in place when remove is dismissed", async () => {
    const user = userEvent.setup();
    const repositoryUrl = "https://github.com/org/skills";
    vi.spyOn(SkillsRepositoryService, "get").mockResolvedValue(
      readySkillsRepository(repositoryUrl),
    );
    mockSkillList([
      buildSkill({
        name: "review",
        origin: "user",
        source: "~/.agents/skills/review/SKILL.md",
        description: "Hand-written review notes.",
        availability: "loaded",
      }),
      buildSkill({
        name: "review",
        origin: "user",
        source: `${REPOSITORY_CHECKOUT_PATH}/review/SKILL.md`,
        description: "Repository review notes.",
        availability: "shadowed",
        shadow_reason: "handwritten",
      }),
      buildSkill({
        name: "lint",
        origin: "user",
        source: `${REPOSITORY_CHECKOUT_PATH}/lint/SKILL.md`,
        description: "Repository lint notes.",
        availability: "loaded",
      }),
    ]);
    const removeSpy = vi
      .spyOn(SkillsRepositoryService, "remove")
      .mockResolvedValue(undefined);

    renderSkillsSettingsScreen();

    const urlField = await screen.findByTestId("skills-repository-url");
    expect(urlField).toHaveValue(repositoryUrl);
    await screen.findByTestId("skill-not-loaded-review");

    const expectRepositoryKept = () => {
      expect(removeSpy).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(urlField).toHaveValue(repositoryUrl);
      expect(screen.getByTestId("skill-card-review")).toBeInTheDocument();
      expect(screen.getByTestId("skill-not-loaded-review")).toBeInTheDocument();
      expect(screen.getByTestId("skill-card-lint")).toBeInTheDocument();
      expect(screen.getByTestId("skills-repository-status")).toHaveTextContent(
        "SETTINGS$SKILLS_REPOSITORY_UP_TO_DATE",
      );
    };

    await user.click(screen.getByTestId("skills-repository-remove"));
    await user.click(
      await screen.findByTestId("skills-repository-remove-cancel"),
    );
    expectRepositoryKept();

    await user.click(screen.getByTestId("skills-repository-remove"));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expectRepositoryKept();

    await user.click(screen.getByTestId("skills-repository-remove"));
    const dialog = await screen.findByRole("dialog");
    await user.click(dialog.firstElementChild as HTMLElement);
    expectRepositoryKept();
  });
});
