import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export interface UseAutoResizeTextareaOptions {
  maxViewportFraction?: number | null;
  minCapPx?: number;
  deps?: ReadonlyArray<unknown>;
}

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
  }, [ref, syncHeight, ...deps]);

  return syncHeight;
}
