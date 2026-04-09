/**
 * Local type stubs for @mariozechner/pi-coding-agent, @mariozechner/pi-tui, and @sinclair/typebox.
 *
 * These are minimal stubs covering only the symbols actually used by pi-session-pin.
 * They let you build with `tsc` without any npm dependencies.
 *
 * When pi installs this package, it runs `npm install` in the package directory, which
 * installs the real @mariozechner/pi-coding-agent — at that point the real types take
 * over and these stubs are shadowed by the actual node_modules.
 *
 * To update stubs when the API changes:
 *   - ExtensionAPI / ExtensionContext / ToolCallEvent types → dist/core/extensions/types.d.ts
 *   - Theme → dist/modes/interactive/theme/theme.d.ts
 *   - TextContent / ImageContent → @mariozechner/pi-ai/dist/types.d.ts
 *   - AgentToolResult → @mariozechner/pi-agent-core/dist/types.d.ts
 *   - TypeBox primitives → @sinclair/typebox
 */

// ── @sinclair/typebox ────────────────────────────────────────────────────────

declare module "@sinclair/typebox" {
  export type TSchema = { readonly [key: string]: unknown };
  export type Static<T extends TSchema> = {
    [K in keyof T]: T[K] extends { type: "string" } ? string
      : T[K] extends { type: "number" } ? number
      : T[K] extends { type: "boolean" } ? boolean
      : T[K] extends { type: "array"; items: infer I } ? Static<I>[]
      : T[K] extends TSchema ? Static<T[K]>
      : unknown;
  } & {};
  export function Literal<T extends string>(v: T): { type: "literal"; const: T };
  export function Optional<T extends TSchema>(v: T): { type: "optional"; items: T };
  export function Union<V extends TSchema[]>(v: V): { type: "union"; anyOf: V };
  export function Object<V extends Record<string, TSchema>>(v: V): { type: "object"; properties: V };
  export function String(opts?: { description?: string }): TSchema;
  export function Number(opts?: { description?: string }): TSchema;
  export function Boolean(opts?: { description?: string }): TSchema;
  export function Array<T extends TSchema>(v: T, opts?: { description?: string }): { type: "array"; items: T };
}

// ── pi-ai content types ──────────────────────────────────────────────────────

interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;
}

interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

// ── Theme ────────────────────────────────────────────────────────────────────

type ThemeColor =
  | "accent" | "border" | "borderAccent" | "borderMuted" | "success" | "error"
  | "warning" | "muted" | "dim" | "text";

type ThemeBg = "selectedBg" | "toolPendingBg" | "toolSuccessBg" | "toolErrorBg";

declare class Theme {
  fg(color: ThemeColor, text: string): string;
  bg(color: ThemeBg, text: string): string;
}

// ── Key utilities from pi-tui ────────────────────────────────────────────────

type KeyId =
  | "up" | "down" | "left" | "right"
  | "enter" | "escape" | "tab" | "backspace"
  | "home" | "end" | "pageup" | "pagedown"
  | "ctrl+c" | "ctrl+d" | "ctrl+u"
  | "f1" | "f2" | "f3" | "f4" | "f5" | "f6"
  | "f7" | "f8" | "f9" | "f10" | "f11" | "f12";

declare function matchesKey(input: string, key: KeyId | string): boolean;
declare function truncateToWidth(text: string, width: number): string;

// ── Component base ────────────────────────────────────────────────────────────

interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
}

// ── Text component ───────────────────────────────────────────────────────────

declare class Text implements Component {
  constructor(text?: string, style?: string);
  render(width: number): string[];
}

// ── Session types ────────────────────────────────────────────────────────────

type SessionEntryBase = {
  id: string;
  parentId?: string;
};

interface MessageSessionEntry extends SessionEntryBase {
  type: "message";
  message: {
    role: "user" | "assistant" | "system";
    content: string | TextContent[];
  };
}

interface CustomSessionEntry extends SessionEntryBase {
  type: "custom";
  customType: string;
  data: unknown;
}

interface LabelSessionEntry extends SessionEntryBase {
  type: "label";
  label: string | undefined;
}

type BranchEntry = MessageSessionEntry | CustomSessionEntry | LabelSessionEntry | SessionEntryBase & { type: string };

interface ReadonlySessionManager {
  getBranch(): BranchEntry[];
}

// ── Extension context ────────────────────────────────────────────────────────

interface ExtensionUIContext {
  select(title: string, options: string[], opts?: ExtensionUIDialogOptions): Promise<string | undefined>;
  confirm(title: string, message: string, opts?: ExtensionUIDialogOptions): Promise<boolean>;
  input(title: string, placeholder?: string, opts?: ExtensionUIDialogOptions): Promise<string | undefined>;
  notify(message: string, type?: "info" | "warning" | "error"): void;
  custom<T>(cb: (tui: unknown, theme: Theme, kb: unknown, done: () => void) => Component): Promise<T>;
  onTerminalInput(handler: (data: string) => void): () => void;
}

interface ExtensionUIDialogOptions {
  signal?: AbortSignal;
  timeout?: number;
}

interface ExtensionContext {
  ui: ExtensionUIContext;
  hasUI: boolean;
  cwd: string;
  sessionManager: ReadonlySessionManager;
  isIdle(): boolean;
  signal: AbortSignal | undefined;
  abort(): void;
}

interface ExtensionCommandContext extends ExtensionContext {
  waitForIdle(): Promise<void>;
}

// ── Agent tool result ────────────────────────────────────────────────────────

type AgentToolResult<T = unknown> = {
  content: (TextContent | ImageContent)[];
  details: T;
};

// ── ExtensionAPI ─────────────────────────────────────────────────────────────

interface ExtensionAPI {
  on(event: "session_start" | "session_shutdown" | "tool_call" | "tool_result", handler: ExtensionHandler<unknown, unknown>): void;
  registerTool(tool: ToolDefinition): void;
  registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void;
  setLabel(entryId: string, label: string | undefined): Promise<void>;
  sendUserMessage(content: string | (TextContent | ImageContent)[], options?: { deliverAs?: "steer" | "followUp" }): void;
  appendEntry<T = unknown>(customType: string, data?: T): void;
  getFlag(name: string): boolean | string | undefined;
  exec(command: string, args: string[], options?: unknown): Promise<unknown>;
  getActiveTools(): string[];
  getAllTools(): unknown[];
  setActiveTools(toolNames: string[]): void;
}

type ExtensionHandler<E, R = unknown> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;

type RegisteredCommand = {
  name: string;
  sourceInfo: unknown;
  description?: string;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
};

type ToolDefinition = {
  name: string;
  label: string;
  description: string;
  parameters: import("@sinclair/typebox").TSchema;
  execute(
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: ((result: AgentToolResult) => void) | undefined,
    ctx: ExtensionContext
  ): Promise<AgentToolResult>;
};

// ── Module exports ────────────────────────────────────────────────────────────

export type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
  ExtensionUIContext,
  TextContent,
  ImageContent,
  Theme,
  Component,
  BranchEntry,
  AgentToolResult,
  RegisteredCommand,
  ToolDefinition,
};

export { Text, matchesKey, truncateToWidth };
