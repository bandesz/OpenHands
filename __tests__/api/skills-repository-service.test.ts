import { HttpError } from "@openhands/typescript-client";
import { SkillsClient } from "@openhands/typescript-client/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { SKILLS_REPOSITORY_QUERY_KEYS } from "#/hooks/query/query-keys";

const { mockGet, mockSave, mockSync, mockRemove } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSave: vi.fn(),
  mockSync: vi.fn(),
  mockRemove: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  SkillsClient: vi.fn(function SkillsClientMock() {
    return {
      get: mockGet,
      save: mockSave,
      sync: mockSync,
      remove: mockRemove,
    };
  }),
}));

import SkillsRepositoryService from "#/api/skills-repository-service";

const localBackend: Backend = {
  id: "local",
  name: "Local",
  host: "http://127.0.0.1:8000",
  apiKey: "local-key",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

const readyRepository = {
  url: "https://github.com/org/skills.git",
  status: "ready" as const,
  commit_sha: "0123456789abcdef0123456789abcdef01234567",
  checkout_path: "/Users/me/.openhands/skills-repository",
  container_path: "/opt/openhands/skills-repository",
  error_code: null,
  error: null,
};

const absentRepository = {
  url: null,
  status: "absent" as const,
  commit_sha: null,
  checkout_path: null,
  container_path: null,
  error_code: null,
  error: null,
};

function useBackend(backend: Backend) {
  setRegisteredBackends([backend]);
  setActiveSelection({ backendId: backend.id });
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  useBackend(localBackend);
  mockGet.mockReset();
  mockSave.mockReset();
  mockSync.mockReset();
  mockRemove.mockReset();
  vi.mocked(SkillsClient).mockClear();
});

afterEach(() => {
  __resetActiveStoreForTests();
});

describe("SKILLS_REPOSITORY_QUERY_KEYS", () => {
  it("identifies the skills repository cache", () => {
    expect(SKILLS_REPOSITORY_QUERY_KEYS.all).toEqual(["skills-repository"]);
  });
});

describe("SkillsRepositoryService", () => {
  it("returns the repository SkillsClient loads", async () => {
    mockGet.mockResolvedValue(readyRepository);

    await expect(SkillsRepositoryService.get()).resolves.toBe(readyRepository);

    expect(SkillsClient).toHaveBeenCalledTimes(1);
    expect(SkillsClient).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "http://127.0.0.1:8000",
        apiKey: "local-key",
      }),
    );
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("returns the repository SkillsClient saves", async () => {
    mockSave.mockResolvedValue(readyRepository);

    await expect(
      SkillsRepositoryService.save("https://github.com/org/skills.git"),
    ).resolves.toBe(readyRepository);

    expect(mockSave).toHaveBeenCalledWith("https://github.com/org/skills.git");
  });

  it("returns the repository SkillsClient syncs", async () => {
    mockSync.mockResolvedValue(readyRepository);

    await expect(SkillsRepositoryService.sync()).resolves.toBe(readyRepository);

    expect(mockSync).toHaveBeenCalledWith();
  });

  it("returns after SkillsClient removes the repository", async () => {
    mockRemove.mockResolvedValue(undefined);

    await expect(SkillsRepositoryService.remove()).resolves.toBeUndefined();

    expect(mockRemove).toHaveBeenCalledWith();
  });

  it("resolves an absent repository on Cloud without calling SkillsClient", async () => {
    useBackend(cloudBackend);

    await expect(SkillsRepositoryService.get()).resolves.toEqual(
      absentRepository,
    );
    await expect(
      SkillsRepositoryService.save("https://github.com/org/skills.git"),
    ).resolves.toEqual(absentRepository);
    await expect(SkillsRepositoryService.sync()).resolves.toEqual(
      absentRepository,
    );
    await expect(SkillsRepositoryService.remove()).resolves.toBeUndefined();
    expect(SkillsClient).not.toHaveBeenCalled();
  });

  it("exposes error_code and error from a 400 save response", async () => {
    mockSave.mockRejectedValue(
      new HttpError(400, "Bad Request", {
        error_code: "invalid_url",
        error: "Enter an http, https, or ssh git URL.",
      }),
    );

    await expect(
      SkillsRepositoryService.save(
        "https://user:token@github.com/org/skills.git",
      ),
    ).rejects.toMatchObject({
      status: 400,
      error_code: "invalid_url",
      error: "Enter an http, https, or ssh git URL.",
    });
  });

  it("exposes error_code and error from a 422 save response", async () => {
    mockSave.mockRejectedValue(
      new HttpError(422, "Unprocessable Entity", {
        error_code: "git_failed",
        error: "fatal: repository not found",
      }),
    );

    await expect(
      SkillsRepositoryService.save("https://github.com/org/missing.git"),
    ).rejects.toMatchObject({
      status: 422,
      error_code: "git_failed",
      error: "fatal: repository not found",
    });
  });

  it("exposes error_code and error from a 409 sync response", async () => {
    mockSync.mockRejectedValue(
      new HttpError(409, "Conflict", {
        error_code: "dirty",
        error: "Repository has local changes. Pull was not applied.",
      }),
    );

    await expect(SkillsRepositoryService.sync()).rejects.toMatchObject({
      status: 409,
      error_code: "dirty",
      error: "Repository has local changes. Pull was not applied.",
    });
  });

  it("rethrows other client failures", async () => {
    const failure = new HttpError(500, "Server Error", { detail: "boom" });
    mockGet.mockRejectedValue(failure);

    await expect(SkillsRepositoryService.get()).rejects.toBe(failure);
  });
});
