import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export interface UseAutoResizeTextareaOptions {
  /**
   * Maximum height as a fraction of visualViewport/window height (e.g. 0.55 for fixed-bottom composers
   * so Send buttons never get pushed off-screen on huge pastes).
   * Pass null or undefined to allow full uncapped vertical expansion.
   */
  maxViewportFraction?: number | null;
  /** Minimum pixel cap when maxViewportFraction is active. Defaults to 240. */
  minCapPx?: number;
  /** Extra dependencies that affect mount state or surrounding layout (e.g. tab, messagesCount). */
  deps?: ReadonlyArray<unknown>;
}

/**
 * Automatically adjusts a <textarea>'s height to fit all of its content cleanly
 * across typing, pasting, programmatic updates, clearing, window/keyboard resize, and width changes.
 */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  options: UseAutoResizeTextareaOptions = {},
): () => void {
  const { maxViewportFraction = null, minCapPx = 240, deps = [] } = options;
  const lastWidthRef = useRef<number>(0);

  const syncHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // Preserve nearest scrollable ancestor scrollTop so height reset does not jump scroll position
    const scrollParent = el.closest<HTMLElement>(".overflow-y-auto, [data-scroll-container]");
    const prevScrollTop = scrollParent ? scrollParent.scrollTop : 0;

    el.style.height = "auto";
    const contentHeight = el.scrollHeight;

    let cap = Infinity;
    if (typeof maxViewportFraction === "number" && maxViewportFraction > 0 && typeof window !== "undefined") {
      const vh = window.visualViewport?.height || window.innerHeight || 800;
      cap = Math.max(minCapPx, Math.floor(vh * maxViewportFraction));
    }

    const nextHeight = Math.min(contentHeight, cap);
    if (nextHeight > 0) {
      el.style.height = `${nextHeight}px`;
    }
    el.style.overflowY = contentHeight > cap ? "auto" : "hidden";

    if (scrollParent && scrollParent.scrollTop !== prevScrollTop) {
      scrollParent.scrollTop = prevScrollTop;
    }
  }, [ref, maxViewportFraction, minCapPx]);

  useLayoutEffect(() => {
    syncHeight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncHeight, value, ...deps]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    lastWidthRef.current = el.clientWidth;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const nextWidth = Math.round(entry.contentRect.width);
        if (nextWidth !== lastWidthRef.current) {
          lastWidthRef.current = nextWidth;
          syncHeight();
        }
      });
      ro.observe(el);
    }

    const onViewportResize = () => {
      syncHeight();
    };

    window.addEventListener("resize", onViewportResize);
    window.visualViewport?.addEventListener("resize", onViewportResize);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onViewportResize);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, syncHeight, ...deps]);

  return syncHeight;
}
