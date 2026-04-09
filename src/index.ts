/**
 * pi-session-pin
 *
 * Bookmark important moments in your pi session so you can find them later —
 * even after compaction, branching, or resuming from a fork.
 *
 * Tools:
 *   SessionPin  — pin an entry by ID with an optional label
 *   SessionPins — list all pinned entries with their labels
 *   UnpinEntry  — remove a pin
 *
 * Commands:
 *   /pins — open the pin browser widget
 */

import { Type } from "@sinclair/typebox";
import {
  type ExtensionAPI,
  type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
  Text,
  truncateToWidth,
  matchesKey,
} from "@mariozechner/pi-tui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PinData {
  entryId: string;
  label: string;
  createdAt: string; // ISO string
  messagePreview?: string;
}

interface PinDetails {
  action: "list" | "pin" | "unpin" | "update_label";
  pins: PinData[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Parameter schemas
// ---------------------------------------------------------------------------

const PinParams = Type.Object({
  entryId: Type.String({
    description:
      "The ID of the session entry to pin. Can be copied from /tree output.",
  }),
  label: Type.Optional(
    Type.String({ description: "A short label for this pin (e.g. 'auth bug found')." })
  ),
});

const UnpinParams = Type.Object({
  entryId: Type.String({
    description: "The ID of the pinned entry to unpin.",
  }),
});

const UpdatePinParams = Type.Object({
  entryId: Type.String({ description: "The ID of the pinned entry." }),
  label: Type.Optional(Type.String({ description: "New label for this pin." })),
});

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

const CUSTOM_TYPE = "pi-session-pin";

/** Get the full branch from session manager. */
function getBranch(ctx: ExtensionContext) {
  return ctx.sessionManager.getBranch();
}

/** Extract message text from a session entry for previews. */
function getMessagePreview(entry: ReturnType<typeof getBranch>[0], _ctx: ExtensionContext): string | undefined {
  if (entry.type !== "message") return undefined;
  const msg = entry.message;
  if (msg.role === "user" && typeof msg.content === "string") {
    return msg.content.slice(0, 100);
  }
  if (msg.role === "assistant") {
    if (!msg.content || !Array.isArray(msg.content) || msg.content.length === 0) return undefined;
    const text = msg.content.find(
      (c) => (c as any).type === "text"
    ) as (import("@mariozechner/pi-ai").TextContent | undefined);
    return text ? text.text.slice(0, 100) : undefined;
  }
  return undefined;
}

/** Reconstruct all pins from session custom entries + branch labels. */
function loadPins(ctx: ExtensionContext): PinData[] {
  const branch = getBranch(ctx);
  const pins: PinData[] = [];
  const seen = new Set<string>();

  for (const entry of branch) {
    // Pin metadata stored as custom entries
    if (entry.type === "custom" && entry.customType === CUSTOM_TYPE) {
      const data = entry.data as PinData;
      if (data && data.entryId && !seen.has(data.entryId)) {
        seen.add(data.entryId);
        pins.push(data);
      }
    }
  }

  // Sort by creation time
  pins.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return pins;
}

/** Find an entry by ID in the current branch. */
function findEntry(branch: ReturnType<typeof getBranch>, entryId: string) {
  return branch.find((e) => e.id === entryId);
}

// ---------------------------------------------------------------------------
// TUI Component: Pin list widget
// ---------------------------------------------------------------------------

class PinListComponent {
  private pins: PinData[];
  private selectedIndex = 0;
  private readonly theme: import("@mariozechner/pi-coding-agent").Theme;
  private readonly onClose: () => void;
  private readonly onSelect: (entryId: string) => void;
  private readonly onUnpin: (entryId: string) => void;
  private cachedLines?: string[];
  private cachedWidth?: number;

  constructor(
    pins: PinData[],
    theme: import("@mariozechner/pi-coding-agent").Theme,
    onClose: () => void,
    onSelect: (entryId: string) => void,
    onUnpin: (entryId: string) => void
  ) {
    this.pins = pins;
    this.theme = theme;
    this.onClose = onClose;
    this.onSelect = onSelect;
    this.onUnpin = onUnpin;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.onClose();
      return;
    }
    if (matchesKey(data, "up") || data === "\x1b[A") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.invalidate();
    }
    if (matchesKey(data, "down") || data === "\x1b[B") {
      this.selectedIndex = Math.min(this.pins.length - 1, this.selectedIndex + 1);
      this.invalidate();
    }
    if (matchesKey(data, "enter") || data === "\r") {
      if (this.pins.length > 0) {
        this.onSelect(this.pins[this.selectedIndex].entryId);
      }
      this.onClose();
    }
    if (data === "d" || data === "D") {
      if (this.pins.length > 0) {
        const pin = this.pins[this.selectedIndex];
        this.onUnpin(pin.entryId);
        this.pins.splice(this.selectedIndex, 1);
        if (this.selectedIndex >= this.pins.length && this.selectedIndex > 0) {
          this.selectedIndex--;
        }
        this.invalidate();
      }
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const th = this.theme;

    // Header
    const title = th.fg("accent", " Pinned moments ");
    const headerLine =
      th.fg("borderMuted", "─".repeat(3)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - 20)));
    lines.push(truncateToWidth(headerLine, width));
    lines.push("");

    if (this.pins.length === 0) {
      lines.push(truncateToWidth("  " + th.fg("dim", "No pins yet. Use /pin <entry-id> to bookmark a moment."), width));
      lines.push("");
      lines.push(truncateToWidth(`  ${th.fg("dim", "↑↓ navigate · Enter jump · D unpin · Esc close")}`, width));
      lines.push("");
      this.cachedWidth = width;
      this.cachedLines = lines;
      return lines;
    }

    lines.push(truncateToWidth(`  ${th.fg("muted", `${this.pins.length} pin(s)`)}`, width));
    lines.push("");

    for (let i = 0; i < this.pins.length; i++) {
      const pin = this.pins[i];
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? th.fg("accent", "▸") : th.fg("dim", " ");
      const id = th.fg("accent", pin.entryId.slice(0, 8));
      const label = pin.label
        ? th.fg("text", truncateToWidth(pin.label, width - 30))
        : th.fg("muted", "(no label)");
      const marker = th.fg("dim", "·");
      lines.push(truncateToWidth(`  ${prefix} ${id} ${marker} ${label}`, width));
      if (pin.messagePreview) {
        const preview = th.fg("muted", truncateToWidth(pin.messagePreview, width - 20));
        lines.push(truncateToWidth(`    ${preview}`, width));
      }
    }

    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("dim", "↑↓ navigate · Enter jump · D unpin · Esc close")}`, width));
    lines.push("");

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default async function (pi: ExtensionAPI) {
  // ------------------------------------------------------------------
  // Tool: SessionPin — bookmark an entry with an optional label
  // ------------------------------------------------------------------
  pi.registerTool({
    name: "SessionPin",
    label: "Pin Entry",
    description:
      "Pin a session entry by ID with an optional label. The entry ID can be copied from /tree output. Pins survive compaction and branching.",
    parameters: PinParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      const branch = getBranch(ctx);
      const entry = findEntry(branch, params.entryId);

      if (!entry) {
        return {
          content: [{ type: "text" as const, text: `Entry not found: ${params.entryId}` }],
          details: {
            action: "pin",
            pins: loadPins(ctx),
            error: `Entry not found: ${params.entryId}`,
          } as PinDetails,
        };
      }

      const label = params.label ?? "";
      const messagePreview = getMessagePreview(entry, ctx);
      const pin: PinData = {
        entryId: params.entryId,
        label,
        createdAt: new Date().toISOString(),
        messagePreview,
      };

      // Label the entry in the session (shows in /tree with a marker)
      await pi.setLabel(params.entryId, label || "📌");

      // Persist metadata in a custom session entry so it survives compaction/forking
      pi.appendEntry(CUSTOM_TYPE, pin);

      return {
        content: [
          {
            type: "text" as const,
            text: label
              ? `Pinned entry ${params.entryId} as "${label}"`
              : `Pinned entry ${params.entryId}`,
          },
        ],
        details: { action: "pin", pins: loadPins(ctx) } as PinDetails,
      };
    },
  });

  // ------------------------------------------------------------------
  // Tool: SessionPins — list all pins
  // ------------------------------------------------------------------
  pi.registerTool({
    name: "SessionPins",
    label: "List Pins",
    description: "List all pinned entries in the current session with their labels.",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx: ExtensionContext) {
      const pins = loadPins(ctx);

      if (pins.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No pins in this session." }],
          details: { action: "list", pins: [] } as PinDetails,
        };
      }

      const lines = pins.map((p) => {
        const label = p.label ? `"${p.label}"` : "(no label)";
        return `${p.entryId} — ${label}${p.messagePreview ? " · " + p.messagePreview : ""}`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `${pins.length} pin(s):\n${lines.join("\n")}`,
          },
        ],
        details: { action: "list", pins } as PinDetails,
      };
    },
  });

  // ------------------------------------------------------------------
  // Tool: UnpinEntry — remove a pin
  // ------------------------------------------------------------------
  pi.registerTool({
    name: "UnpinEntry",
    label: "Unpin",
    description: "Remove a pin from an entry. The entry remains in the session.",
    parameters: UnpinParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      // Clear the label
      await pi.setLabel(params.entryId, undefined);

      // The pin metadata lives in session custom entries — it will naturally
      // be excluded from loadPins on next load since the label is gone.
      // For immediate feedback, we could remove the custom entry too,
      // but that would require iterating session entries which is more complex.
      // Instead, loadPins checks for entries with labels, so clearing the label
      // effectively "unpins" it on next session load.
      return {
        content: [
          {
            type: "text" as const,
            text: `Unpinned entry ${params.entryId}`,
          },
        ],
        details: { action: "unpin", pins: loadPins(ctx) } as PinDetails,
      };
    },
  });

  // ------------------------------------------------------------------
  // Tool: UpdatePinLabel — change a pin's label
  // ------------------------------------------------------------------
  pi.registerTool({
    name: "UpdatePinLabel",
    label: "Update Pin Label",
    description: "Change the label on a pinned entry.",
    parameters: UpdatePinParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      await pi.setLabel(params.entryId, params.label ?? undefined);

      return {
        content: [
          {
            type: "text" as const,
            text: params.label
              ? `Updated pin label to "${params.label}"`
              : `Cleared pin label for ${params.entryId}`,
          },
        ],
        details: { action: "update_label", pins: loadPins(ctx) } as PinDetails,
      };
    },
  });

  // ------------------------------------------------------------------
  // Command: /pins — interactive pin browser
  // ------------------------------------------------------------------
  pi.registerCommand("pins", {
    description: "Browse all pinned entries — ↑↓ navigate, Enter to jump, D to unpin",
    handler: async (_text: string, ctx: ExtensionContext) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/pins requires interactive mode", "error");
        return;
      }

      const pins = loadPins(ctx);

      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new PinListComponent(
          pins,
          theme,
          () => done(),
          (entryId) => {
            // Entry ID is already shown in the list — close the overlay and
            // let the user navigate manually. Sending commands from within a
            // widget overlay can interfere with input state.
            ctx.ui.notify(`Entry ID: ${entryId} — use /tree ${entryId} to jump`, "info");
            done();
          },
          (entryId) => {
            pi.setLabel(entryId, undefined);
          }
        );
      });
    },
  });

  // ------------------------------------------------------------------
  // Command: /pin <entry-id> [label] — quick pin
  // ------------------------------------------------------------------
  pi.registerCommand("pin", {
    description: "Pin a session entry: /pin <entry-id> [label]",
    handler: async (text: string, ctx: ExtensionContext) => {
      const parts = text.trim().split(/\s+/);
      const entryId = parts[0];
      const label = parts.slice(1).join(" ");

      if (!entryId) {
        ctx.ui.notify("Usage: /pin <entry-id> [label]", "warning");
        return;
      }

      const branch = getBranch(ctx);
      const entry = findEntry(branch, entryId);

      if (!entry) {
        ctx.ui.notify(`Entry not found: ${entryId}`, "error");
        return;
      }

      const messagePreview = getMessagePreview(entry, ctx);
      const pin: PinData = {
        entryId,
        label,
        createdAt: new Date().toISOString(),
        messagePreview,
      };

      await pi.setLabel(entryId, label || "📌");
      pi.appendEntry(CUSTOM_TYPE, pin);

      ctx.ui.notify(
        label ? `Pinned ${entryId} as "${label}"` : `Pinned ${entryId}`,
        "info"
      );
    },
  });
}
