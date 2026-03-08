import * as ChildProcess from "node:child_process";
import * as Path from "node:path";

import type {
  DesktopEnvironmentReport,
  DesktopEnvironmentReportInput,
  DesktopProviderDiagnostic,
} from "@t3tools/contracts";

const COMMAND_TIMEOUT_MS = 4_000;

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  errorMessage: string | null;
}

function trimToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstOutputLine(result: CommandResult): string | null {
  const firstNonEmptyLine = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstNonEmptyLine ?? null;
}

function runCommand(binaryPath: string, args: readonly string[]): CommandResult {
  try {
    const result = ChildProcess.spawnSync(binaryPath, [...args], {
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
      env: process.env,
      shell: process.platform === "win32",
    });
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      code: result.status,
      timedOut: result.error?.name === "ETIMEDOUT" || result.signal === "SIGTERM",
      errorMessage: result.error ? result.error.message : null,
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: "",
      code: null,
      timedOut: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function providerMissingMessage(providerName: string, binaryPath: string): string {
  const binaryLabel = Path.basename(binaryPath);
  return `${providerName} CLI (\`${binaryLabel}\`) is not installed or not on PATH.`;
}

function unavailableDiagnostic(input: {
  provider: DesktopProviderDiagnostic["provider"];
  providerName: string;
  binaryPath: string;
  versionResult: CommandResult;
}): DesktopProviderDiagnostic {
  const missing =
    input.versionResult.errorMessage?.toLowerCase().includes("enoent") === true ||
    input.versionResult.errorMessage?.toLowerCase().includes("not found") === true;
  const timedOut = input.versionResult.timedOut;
  return {
    provider: input.provider,
    binaryPath: input.binaryPath,
    status: "error",
    available: false,
    authStatus: "unknown",
    version: firstOutputLine(input.versionResult),
    message: missing
      ? providerMissingMessage(input.providerName, input.binaryPath)
      : timedOut
        ? `${input.providerName} CLI is installed but failed to run. Timed out while running command.`
        : trimToNull(input.versionResult.stderr) ??
          input.versionResult.errorMessage ??
          `${input.providerName} CLI is installed but failed to run.`,
  };
}

function parseCodexAuth(result: CommandResult): Pick<
  DesktopProviderDiagnostic,
  "status" | "authStatus" | "message"
> {
  const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (
    combined.includes("not logged in") ||
    combined.includes("login required") ||
    combined.includes("authentication required") ||
    combined.includes("run `codex login`") ||
    combined.includes("run codex login")
  ) {
    return {
      status: "error",
      authStatus: "unauthenticated",
      message: "Codex CLI is not authenticated. Run `codex login` and try again.",
    };
  }
  if (result.code === 0) {
    return { status: "ready", authStatus: "authenticated", message: null };
  }
  return {
    status: "warning",
    authStatus: "unknown",
    message:
      trimToNull(result.stderr) ??
      trimToNull(result.stdout) ??
      "Could not verify Codex authentication status.",
  };
}

function parseClaudeAuth(result: CommandResult): Pick<
  DesktopProviderDiagnostic,
  "status" | "authStatus" | "message"
> {
  const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (
    combined.includes("not logged in") ||
    combined.includes("login required") ||
    combined.includes("setup-token")
  ) {
    return {
      status: "error",
      authStatus: "unauthenticated",
      message: "Claude Code is not authenticated. Run `claude auth login` and try again.",
    };
  }
  if (
    combined.includes("login method:") ||
    combined.includes("organization:") ||
    combined.includes("email:")
  ) {
    return { status: "ready", authStatus: "authenticated", message: null };
  }
  if (result.code === 0) {
    return { status: "ready", authStatus: "authenticated", message: null };
  }
  return {
    status: "warning",
    authStatus: "unknown",
    message:
      trimToNull(result.stderr) ??
      trimToNull(result.stdout) ??
      "Could not verify Claude Code authentication status.",
  };
}

function parseCursorAuth(result: CommandResult): Pick<
  DesktopProviderDiagnostic,
  "status" | "authStatus" | "message"
> {
  const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (
    combined.includes("not logged in") ||
    combined.includes("login required") ||
    combined.includes("starting login process")
  ) {
    return {
      status: "error",
      authStatus: "unauthenticated",
      message: "Cursor Agent CLI is not authenticated. Run `cursor-agent login` and try again.",
    };
  }
  if (combined.includes("user email")) {
    const unauthenticated = combined.includes("user email          not logged in");
    return {
      status: unauthenticated ? "error" : "ready",
      authStatus: unauthenticated ? "unauthenticated" : "authenticated",
      message: unauthenticated
        ? "Cursor Agent CLI is not authenticated. Run `cursor-agent login` and try again."
        : null,
    };
  }
  if (result.code === 0) {
    return { status: "ready", authStatus: "authenticated", message: null };
  }
  return {
    status: "warning",
    authStatus: "unknown",
    message:
      trimToNull(result.stderr) ??
      trimToNull(result.stdout) ??
      "Could not verify Cursor authentication status.",
  };
}

function diagnoseProvider(input: {
  provider: DesktopProviderDiagnostic["provider"];
  providerName: string;
  binaryPath: string;
  versionArgs: readonly string[];
  authArgs: readonly string[];
  parseAuth: (
    result: CommandResult,
  ) => Pick<DesktopProviderDiagnostic, "status" | "authStatus" | "message">;
}): DesktopProviderDiagnostic {
  const versionResult = runCommand(input.binaryPath, input.versionArgs);
  const version = firstOutputLine(versionResult);
  if (versionResult.errorMessage || versionResult.timedOut || versionResult.code !== 0) {
    return unavailableDiagnostic({
      provider: input.provider,
      providerName: input.providerName,
      binaryPath: input.binaryPath,
      versionResult,
    });
  }

  const authResult = runCommand(input.binaryPath, input.authArgs);
  const auth = input.parseAuth(authResult);
  return {
    provider: input.provider,
    binaryPath: input.binaryPath,
    status: auth.status,
    available: true,
    authStatus: auth.authStatus,
    version,
    message: auth.message,
  };
}

export function collectDesktopEnvironmentReport(input: {
  appVersion: string;
  electronVersion: string;
  stateDirectory: string;
  logDirectory: string;
  environment?: NodeJS.ProcessEnv;
  reportInput?: DesktopEnvironmentReportInput;
}): DesktopEnvironmentReport {
  const environment = input.environment ?? process.env;
  const codexBinaryPath = input.reportInput?.codexBinaryPath?.trim() || "codex";

  return {
    checkedAt: new Date().toISOString(),
    appVersion: input.appVersion,
    electronVersion: input.electronVersion,
    platform: process.platform,
    arch: process.arch,
    shell: environment.SHELL?.trim() || null,
    stateDirectory: input.stateDirectory,
    logDirectory: input.logDirectory,
    pathEntries: (environment.PATH ?? "")
      .split(Path.delimiter)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
    providerDiagnostics: [
      diagnoseProvider({
        provider: "codex",
        providerName: "Codex",
        binaryPath: codexBinaryPath,
        versionArgs: ["--version"],
        authArgs: ["login", "status"],
        parseAuth: parseCodexAuth,
      }),
      diagnoseProvider({
        provider: "claudeCode",
        providerName: "Claude Code",
        binaryPath: "claude",
        versionArgs: ["--version"],
        authArgs: ["auth", "status", "--text"],
        parseAuth: parseClaudeAuth,
      }),
      diagnoseProvider({
        provider: "cursor",
        providerName: "Cursor Agent",
        binaryPath: "cursor-agent",
        versionArgs: ["--version"],
        authArgs: ["about"],
        parseAuth: parseCursorAuth,
      }),
    ],
  };
}
