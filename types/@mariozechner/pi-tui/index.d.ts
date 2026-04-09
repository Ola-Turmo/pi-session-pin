/**
 * Stub for @mariozechner/pi-tui.
 * Only covers the symbols imported by pi-session-pin:
 *   Text, truncateToWidth, matchesKey
 */

declare module "@mariozechner/pi-tui" {
  type KeyId =
    | "up" | "down" | "left" | "right"
    | "enter" | "escape" | "tab" | "backspace"
    | "home" | "end" | "pageup" | "pagedown"
    | "ctrl+c" | "ctrl+d" | "ctrl+u"
    | "f1" | "f2" | "f3" | "f4" | "f5" | "f6"
    | "f7" | "f8" | "f9" | "f10" | "f11" | "f12";

  interface Component {
    render(width: number): string[];
    handleInput?(data: string): void;
  }

  export class Text implements Component {
    constructor(text?: string, style?: string);
    render(width: number): string[];
  }

  export function matchesKey(input: string, key: KeyId | string): boolean;
  export function truncateToWidth(text: string, width: number): string;
  export function visibleWidth(text: string): number;
  export function wrapTextWithAnsi(text: string, width: number): string[];
}
