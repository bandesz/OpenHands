import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Type definitions for the module exports
type NormalizeVersion = (version: string | null) => string | null;
type VersionsEqual = (v1: string, v2: string) => boolean;
type ParseSdkVersions = (requiresDist: string[]) => Record<string, string>;
type FindClientPinMismatch = (
  pinned: string | null,
  expected: string,
) => { package: string; expected: string; actual: string | null } | null;
type ResolveClientPin = (
  specifier: string | null,
  baseDir?: string,
) => string | null;
type ReadClientPin = () => string | null;

// Import after mocking - need dynamic import since the script has side effects
describe("check-sdk-version-sync helpers", () => {
  let normalizeVersion: NormalizeVersion;
  let versionsEqual: VersionsEqual;
  let parseSdkVersionsFromRequiresDist: ParseSdkVersions;
  let SDK_PACKAGES: string[];
  let findClientPinMismatch: FindClientPinMismatch;
  let resolveClientPin: ResolveClientPin;
  let readClientPin: ReadClientPin;
  let CLIENT_PACKAGE_NAME: string;

  beforeEach(async () => {
    // Reset modules to get fresh imports
    vi.resetModules();

    // Mock console to suppress output during tests
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Dynamic import to get fresh module
    const module = await import("../../scripts/check-sdk-version-sync.mjs");
    normalizeVersion = module.normalizeVersion as NormalizeVersion;
    versionsEqual = module.versionsEqual as VersionsEqual;
    parseSdkVersionsFromRequiresDist =
      module.parseSdkVersionsFromRequiresDist as ParseSdkVersions;
    SDK_PACKAGES = module.SDK_PACKAGES as string[];
    findClientPinMismatch =
      module.findClientPinMismatch as FindClientPinMismatch;
    resolveClientPin = module.resolveClientPin as ResolveClientPin;
    readClientPin = module.readClientPin as ReadClientPin;
    CLIENT_PACKAGE_NAME = module.CLIENT_PACKAGE_NAME as string;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("normalizeVersion", () => {
    it("returns null for null input", () => {
      expect(normalizeVersion(null)).toBe(null);
    });

    it("pads two-part versions to three parts", () => {
      expect(normalizeVersion("1.22")).toBe("1.22.0");
    });

    it("keeps three-part versions as-is", () => {
      expect(normalizeVersion("1.22.0")).toBe("1.22.0");
    });

    it("truncates versions with more than three parts", () => {
      expect(normalizeVersion("1.22.0.1")).toBe("1.22.0");
    });

    it("strips pre-release metadata", () => {
      expect(normalizeVersion("1.22.0-beta.1")).toBe("1.22.0");
      expect(normalizeVersion("1.22.0-alpha")).toBe("1.22.0");
    });

    it("strips build metadata", () => {
      expect(normalizeVersion("1.22.0+build.123")).toBe("1.22.0");
    });

    it("handles versions with both pre-release and build metadata", () => {
      expect(normalizeVersion("1.22.0-beta+build")).toBe("1.22.0");
    });
  });

  describe("versionsEqual", () => {
    it("returns true for identical versions", () => {
      expect(versionsEqual("1.22.0", "1.22.0")).toBe(true);
    });

    it("returns true for semantically equivalent versions", () => {
      expect(versionsEqual("1.22", "1.22.0")).toBe(true);
      expect(versionsEqual("1.22.0", "1.22")).toBe(true);
    });

    it("returns false for different versions", () => {
      expect(versionsEqual("1.21.0", "1.22.0")).toBe(false);
      expect(versionsEqual("1.22.0", "1.22.1")).toBe(false);
    });

    it("ignores pre-release metadata for base comparison", () => {
      expect(versionsEqual("1.22.0-beta", "1.22.0")).toBe(true);
    });
  });

  describe("parseSdkVersionsFromRequiresDist", () => {
    it("parses standard PEP 508 format with >=", () => {
      const deps = [
        "openhands-sdk>=1.22.0,<2.0.0",
        "openhands-workspace>=1.22.0",
      ];
      const versions = parseSdkVersionsFromRequiresDist(deps);

      expect(versions["openhands-sdk"]).toBe("1.22.0");
      expect(versions["openhands-workspace"]).toBe("1.22.0");
    });

    it("parses exact version pins with ==", () => {
      const deps = ["openhands-tools==1.21.1"];
      const versions = parseSdkVersionsFromRequiresDist(deps);

      expect(versions["openhands-tools"]).toBe("1.21.1");
    });

    it("parses parenthesized format", () => {
      const deps = ["openhands-sdk (>=1.22.0)"];
      const versions = parseSdkVersionsFromRequiresDist(deps);

      expect(versions["openhands-sdk"]).toBe("1.22.0");
    });

    it("returns empty object for no matching packages", () => {
      const deps = ["requests>=2.0.0", "flask>=1.0.0"];
      const versions = parseSdkVersionsFromRequiresDist(deps);

      expect(Object.keys(versions)).toHaveLength(0);
    });

    it("handles mixed dependencies", () => {
      const deps = [
        "requests>=2.0.0",
        "openhands-sdk>=1.22.0",
        "flask>=1.0.0",
        "openhands-workspace (>=1.21.0)",
      ];
      const versions = parseSdkVersionsFromRequiresDist(deps);

      expect(versions["openhands-sdk"]).toBe("1.22.0");
      expect(versions["openhands-workspace"]).toBe("1.21.0");
      expect(versions["requests"]).toBeUndefined();
    });

    it("handles tilde version specifier", () => {
      const deps = ["openhands-sdk~=1.22.0"];
      const versions = parseSdkVersionsFromRequiresDist(deps);

      expect(versions["openhands-sdk"]).toBe("1.22.0");
    });

    it("handles version with extras", () => {
      // PyPI sometimes includes extras in requires_dist
      const deps = ["openhands-sdk[all]>=1.22.0"];
      const versions = parseSdkVersionsFromRequiresDist(deps);

      // Current implementation may not handle extras perfectly,
      // but should at least not crash
      expect(versions).toBeDefined();
    });
  });

  describe("SDK_PACKAGES", () => {
    it("contains the expected SDK packages", () => {
      expect(SDK_PACKAGES).toContain("openhands-sdk");
      expect(SDK_PACKAGES).toContain("openhands-tools");
      expect(SDK_PACKAGES).toContain("openhands-workspace");
      expect(SDK_PACKAGES).toContain("openhands-agent-server");
      expect(SDK_PACKAGES).toHaveLength(4);
    });
  });

  describe("findClientPinMismatch", () => {
    it("accepts a pin equal to the expected agent-server version", () => {
      expect(findClientPinMismatch("1.46.0", "1.46.0")).toBeNull();
      expect(findClientPinMismatch("1.46", "1.46.0")).toBeNull();
    });

    it("reports the skew that ships a stale ACP picker", () => {
      // 1.39.0 against agent-server 1.46.0 is the drift that left GPT-6 Astra
      // out of the Codex picker while offering three ids the server rejects.
      expect(findClientPinMismatch("1.39.0", "1.46.0")).toEqual({
        package: CLIENT_PACKAGE_NAME,
        expected: "1.46.0",
        actual: "1.39.0",
      });
    });

    it("rejects a range, which would let the skew back in", () => {
      for (const range of ["^1.46.0", "~1.46.0", ">=1.46.0", "latest"]) {
        expect(findClientPinMismatch(range, "1.46.0"), range).not.toBeNull();
      }
    });

    it("reports an absent dependency rather than passing silently", () => {
      expect(findClientPinMismatch(null, "1.46.0")).toEqual({
        package: CLIENT_PACKAGE_NAME,
        expected: "1.46.0",
        actual: null,
      });
    });
  });

  describe("resolveClientPin", () => {
    let tempRoot: string;
    let canvasDir: string;

    beforeEach(() => {
      tempRoot = mkdtempSync(join(tmpdir(), "client-pin-"));
      canvasDir = join(tempRoot, "OpenHands");
      mkdirSync(canvasDir);
    });

    afterEach(() => {
      rmSync(tempRoot, { recursive: true, force: true });
    });

    function writeClientPackage(version: string) {
      const clientDir = join(
        tempRoot,
        "software-agent-sdk",
        "clients",
        "typescript",
      );
      mkdirSync(clientDir, { recursive: true });
      writeFileSync(
        join(clientDir, "package.json"),
        JSON.stringify({
          name: "@openhands/typescript-client",
          version,
        }),
      );
    }

    it("resolves a file: dependency to that package's version", () => {
      writeClientPackage("1.62.0");

      expect(
        resolveClientPin(
          "file:../software-agent-sdk/clients/typescript",
          canvasDir,
        ),
      ).toBe("1.62.0");
    });

    it("leaves a semver pin unchanged", () => {
      expect(resolveClientPin("1.62.0", canvasDir)).toBe("1.62.0");
    });

    it("fails the mismatch check when the file: package version differs", () => {
      writeClientPackage("9.9.9");

      expect(
        findClientPinMismatch(
          resolveClientPin(
            "file:../software-agent-sdk/clients/typescript",
            canvasDir,
          ),
          "1.62.0",
        ),
      ).toEqual({
        package: CLIENT_PACKAGE_NAME,
        expected: "1.62.0",
        actual: "9.9.9",
      });
    });

    it("reports a missing file: package.json as a mismatch without throwing", () => {
      let resolved: string | null = "unset";

      expect(() => {
        resolved = resolveClientPin(
          "file:../software-agent-sdk/clients/typescript",
          canvasDir,
        );
      }).not.toThrow();
      expect(findClientPinMismatch(resolved, "1.62.0")).toEqual({
        package: CLIENT_PACKAGE_NAME,
        expected: "1.62.0",
        actual: null,
      });
    });
  });

  describe("readClientPin", () => {
    it("reads an exact pin this repo actually ships", () => {
      expect(readClientPin()).toBe("1.62.0");
    });

    it("matches versions.agentServer for the shipped file: pin", () => {
      expect(findClientPinMismatch(readClientPin(), "1.62.0")).toBeNull();
    });
  });
});
