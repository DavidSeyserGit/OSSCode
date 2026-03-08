import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ThreadId, type ChatAttachment } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterAll, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import { ServerConfig } from "../../config.ts";
import { CursorAdapter } from "../Services/CursorAdapter.ts";
import { makeCursorAdapterLive } from "./CursorAdapter.ts";

const asThreadId = (value: string): ThreadId => ThreadId.makeUnsafe(value);

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for expectation.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osscode-cursor-adapter-"));
const stateDir = path.join(tempRoot, "state");
const workspaceDir = path.join(tempRoot, "workspace");
const capturedArgsPath = path.join(tempRoot, "captured-args.json");
const fakeCursorAgentPath = path.join(tempRoot, "fake-cursor-agent.js");

fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(workspaceDir, { recursive: true });
fs.writeFileSync(
  fakeCursorAgentPath,
  `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(capturedArgsPath)}, JSON.stringify({ args, cwd: process.cwd() }));
if (args[0] === "create-chat") {
  process.stdout.write("22222222-2222-2222-2222-222222222222\\n");
  process.exit(0);
}
process.stdout.write(JSON.stringify({
  type: "system",
  subtype: "init",
  session_id: "22222222-2222-2222-2222-222222222222",
  model: "auto"
}) + "\\n");
process.stdout.write(JSON.stringify({
  type: "assistant",
  message: {
    content: [{ type: "text", text: "cursor response" }]
  }
}) + "\\n");
process.stdout.write(JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false
}) + "\\n");
`,
  "utf8",
);
fs.chmodSync(fakeCursorAgentPath, 0o755);

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const layer = it.layer(
  makeCursorAdapterLive({ binaryPath: fakeCursorAgentPath }).pipe(
    Layer.provideMerge(ServerConfig.layerTest(workspaceDir, stateDir)),
    Layer.provideMerge(NodeServices.layer),
  ),
);

layer("CursorAdapterLive", (it) => {
  it.effect("passes image attachments to Cursor Agent through prompt paths and add-dir access", () =>
    Effect.gen(function* () {
      const adapter = yield* CursorAdapter;
      const attachment: ChatAttachment = {
        type: "image",
        id: "thread-cursor-00000000-0000-0000-0000-000000000001",
        name: "screenshot.png",
        mimeType: "image/png",
        sizeBytes: 5,
      };
      const attachmentPath = resolveAttachmentPath({
        stateDir,
        attachment,
      });

      assert.ok(attachmentPath);
      if (!attachmentPath) {
        return;
      }

      fs.mkdirSync(path.dirname(attachmentPath), { recursive: true });
      fs.writeFileSync(attachmentPath, Buffer.from("hello"));
      fs.rmSync(capturedArgsPath, { force: true });

      yield* adapter.startSession({
        provider: "cursor",
        threadId: asThreadId("thread-1"),
        cwd: workspaceDir,
        runtimeMode: "full-access",
      });

      yield* adapter.sendTurn({
        threadId: asThreadId("thread-1"),
        input: "Describe the attached UI issue.",
        attachments: [attachment],
      });

      yield* Effect.promise(() => waitFor(() => fs.existsSync(capturedArgsPath)));
      yield* Effect.promise(() =>
        waitFor(async () => {
          const sessions = await Effect.runPromise(adapter.listSessions());
          return sessions[0]?.status === "ready";
        }),
      );

      const captured = JSON.parse(fs.readFileSync(capturedArgsPath, "utf8")) as {
        args: string[];
        cwd: string;
      };
      const promptIndex = captured.args.indexOf("-p");
      const addDirIndex = captured.args.indexOf("--add-dir");
      const normalizedCapturedCwd = fs.realpathSync.native(captured.cwd);
      const normalizedWorkspaceDir = fs.realpathSync.native(workspaceDir);
      const normalizedAttachmentDir = fs.realpathSync.native(path.dirname(attachmentPath));

      assert.equal(normalizedCapturedCwd, normalizedWorkspaceDir);
      assert.notEqual(promptIndex, -1);
      assert.notEqual(addDirIndex, -1);
      assert.equal(
        fs.realpathSync.native(captured.args[addDirIndex + 1] ?? ""),
        normalizedAttachmentDir,
      );

      const prompt = captured.args[promptIndex + 1] ?? "";
      assert.match(prompt, /Describe the attached UI issue\./);
      assert.match(prompt, /Open and inspect these image paths directly before answering:/);
      assert.match(prompt, new RegExp(attachmentPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }),
  );
});
