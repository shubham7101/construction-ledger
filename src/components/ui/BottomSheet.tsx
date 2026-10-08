"use client";

import clsx from "clsx";
import type React from "react";
import { useEffect, useId, useRef } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  zIndex?: number;
  children: React.ReactNode;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  fixedHeight?: boolean;
}

/* Module-level state shared by all open sheets (nested pickers open above other sheets). */
const openStack: string[] = [];
let lockCount = 0;
let previousOverflow = "";

const lockScroll = () => {
  if (lockCount++ === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
};
const unlockScroll = () => {
  if (--lockCount === 0) document.body.style.overflow = previousOverflow;
};

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  zIndex = 50,
  children,
  containerClassName,
  containerStyle,
  fixedHeight = false,
}) => {
  const id = useId();
  const titleId = `${id}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    openStack.push(id);
    lockScroll();
    panelRef.current?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id) return; // only the top sheet reacts
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = openStack.lastIndexOf(id);
      if (index >= 0) openStack.splice(index, 1);
      unlockScroll();
      previouslyFocused?.focus?.();
    };
  }, [isOpen, id]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center md:items-center md:p-6"
      style={{ zIndex }}
    >
      {/* backdrop */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 min-h-0 cursor-default border-none bg-slate-950/60 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={clsx(
          "sheet relative max-h-[90dvh] w-full max-w-107.5 rounded-t-[28px] border-t border-slate-100 bg-white p-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-2xl outline-none",
          "md:max-h-[85dvh] md:max-w-lg md:rounded-3xl md:border md:pb-6 md:pt-5",
          fixedHeight ? "flex flex-col overflow-hidden" : "overflow-y-auto",
          containerClassName,
        )}
        style={containerStyle}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-slate-300 md:hidden" />

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-9 min-h-9 w-9 cursor-pointer place-items-center rounded-full border-none bg-slate-100 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 md:right-5 md:top-5"
        >
          ✕
        </button>

        {title && (
          <h2
            id={titleId}
            className="pb-2 pr-10 text-lg font-extrabold text-slate-900"
          >
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
};
