import { isHttpError } from "@openhands/typescript-client";
import {
  SkillsClient,
  type SkillsRepository,
} from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "./agent-server-client-options";
import { getActiveBackend } from "./backend-registry/active-store";

const ABSENT_REPOSITORY: SkillsRepository = {
  url: null,
  status: "absent",
  commit_sha: null,
  checkout_path: null,
  container_path: null,
  error_code: null,
  error: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCloudBackend(): boolean {
  return getActiveBackend().backend.kind === "cloud";
}

function exposeRepositoryError(error: unknown): never {
  if (isHttpError(error) && (error.status === 422 || error.status === 409)) {
    const body = isRecord(error.response) ? error.response : {};
    const message = typeof body.error === "string" ? body.error : error.message;
    throw Object.assign(new Error(message), {
      status: error.status,
      error_code: body.error_code,
      error: body.error,
    });
  }
  throw error;
}

async function callClient<T>(
  operation: (client: SkillsClient) => Promise<T>,
): Promise<T> {
  try {
    return await operation(new SkillsClient(getAgentServerClientOptions()));
  } catch (error) {
    exposeRepositoryError(error);
  }
}

function absentRepository(): SkillsRepository {
  return { ...ABSENT_REPOSITORY };
}

class SkillsRepositoryService {
  static get(): Promise<SkillsRepository> {
    if (isCloudBackend()) return Promise.resolve(absentRepository());
    return callClient((client) => client.get());
  }

  static save(url: string): Promise<SkillsRepository> {
    if (isCloudBackend()) return Promise.resolve(absentRepository());
    return callClient((client) => client.save(url));
  }

  static sync(): Promise<SkillsRepository> {
    if (isCloudBackend()) return Promise.resolve(absentRepository());
    return callClient((client) => client.sync());
  }

  static remove(): Promise<void> {
    if (isCloudBackend()) return Promise.resolve();
    return callClient((client) => client.remove());
  }
}

export default SkillsRepositoryService;
