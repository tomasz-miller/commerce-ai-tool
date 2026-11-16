import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLangfuseMask, flushLangfuse, registerLangfuseFlush } from "@commerce-ai-tool/server/flush";

const mocks = vi.hoisted(() => ({
  processorOptions: [] as unknown[],
  forceFlush: vi.fn(async () => {}),
  start: vi.fn(),
  shutdown: vi.fn(async () => {}),
  sdkOptions: [] as unknown[],
}));

vi.mock("@langfuse/otel", () => ({
  LangfuseSpanProcessor: class {
    forceFlush = mocks.forceFlush;
    constructor(options: unknown) {
      mocks.processorOptions.push(options);
    }
  },
}));

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    start = mocks.start;
    shutdown = mocks.shutdown;
    constructor(options: unknown) {
      mocks.sdkOptions.push(options);
    }
  },
}));

import { shutdownOnSignals, startLangfuseTracing } from "./tracing.js";

afterEach(() => {
  mocks.processorOptions.length = 0;
  mocks.sdkOptions.length = 0;
  mocks.start.mockClear();
  mocks.shutdown.mockClear();
  mocks.forceFlush.mockClear();
  registerLangfuseFlush(null);
});

describe("startLangfuseTracing", () => {
  it("does not start the SDK without both Langfuse keys", () => {
    expect(startLangfuseTracing({})).toBeUndefined();
    expect(startLangfuseTracing({ LANGFUSE_PUBLIC_KEY: "pk" })).toBeUndefined();
    expect(startLangfuseTracing({ LANGFUSE_SECRET_KEY: "sk" })).toBeUndefined();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("starts NodeSDK with a LangfuseSpanProcessor that uses defaultLangfuseMask", () => {
    const sdk = startLangfuseTracing({
      LANGFUSE_PUBLIC_KEY: "pk",
      LANGFUSE_SECRET_KEY: "sk",
      LANGFUSE_BASE_URL: "https://langfuse.example.test",
    });

    expect(sdk).toBeDefined();
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.processorOptions).toEqual([
      {
        publicKey: "pk",
        secretKey: "sk",
        baseUrl: "https://langfuse.example.test",
        mask: defaultLangfuseMask,
      },
    ]);
    expect(mocks.sdkOptions).toHaveLength(1);
  });

  it("registers the processor flush so the Express adapter flushes after each response", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    try {
      startLangfuseTracing({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" });
      await flushLangfuse();
      expect(mocks.forceFlush).toHaveBeenCalledOnce();
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }
  });
});

describe("shutdownOnSignals", () => {
  it("calls sdk.shutdown() on SIGTERM and SIGINT, then exits", async () => {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      mocks.shutdown.mockClear();
      const proc = new EventEmitter();
      const exit = vi.fn();
      shutdownOnSignals({ shutdown: mocks.shutdown }, proc, exit);

      proc.emit(signal);
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

      expect(mocks.shutdown).toHaveBeenCalledOnce();
    }
  });

  it("closes the HTTP server before sdk.shutdown() and exit", async () => {
    const events: string[] = [];
    const server = {
      close: vi.fn((callback?: (error?: Error) => void) => {
        events.push("close");
        setTimeout(() => callback?.(), 0);
      }),
    };
    mocks.shutdown.mockImplementationOnce(async () => {
      events.push("shutdown");
    });
    const proc = new EventEmitter();
    const exit = vi.fn(() => {
      events.push("exit");
    });
    shutdownOnSignals({ shutdown: mocks.shutdown }, proc, exit, server);

    proc.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(events).toEqual(["close", "shutdown", "exit"]);
  });

  it("still shuts down when closing the server fails", async () => {
    const server = {
      close: vi.fn((callback?: (error?: Error) => void) => callback?.(new Error("not running"))),
    };
    const proc = new EventEmitter();
    const exit = vi.fn();
    shutdownOnSignals({ shutdown: mocks.shutdown }, proc, exit, server);

    proc.emit("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(mocks.shutdown).toHaveBeenCalledOnce();
  });

  it("shuts down once when both signals arrive and still exits if shutdown fails", async () => {
    mocks.shutdown.mockRejectedValueOnce(new Error("export failed"));
    const proc = new EventEmitter();
    const exit = vi.fn();
    shutdownOnSignals({ shutdown: mocks.shutdown }, proc, exit);

    proc.emit("SIGTERM");
    proc.emit("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(mocks.shutdown).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
