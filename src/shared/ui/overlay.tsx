"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactElement, ReactNode } from "react";
import { cn } from "./cn";

/*
 * Modal and sheet patterns built on Base UI's accessible Dialog (focus trap, Escape, scroll lock,
 * aria wiring). Modal: centred panel for confirmations. Sheet: full-height side panel on desktop and a
 * bottom sheet on mobile, used for filters and secondary forms.
 */

interface OverlayProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

const backdrop =
  "fixed inset-0 z-40 bg-ink/45 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0";

function Header({ title, description }: Pick<OverlayProps, "title" | "description">) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-rule pb-4">
      <div className="flex flex-col gap-1">
        <BaseDialog.Title className="font-display text-2xl leading-tight">{title}</BaseDialog.Title>
        {description ? (
          <BaseDialog.Description className="text-sm text-graphite">{description}</BaseDialog.Description>
        ) : null}
      </div>
      <BaseDialog.Close className="-mr-1 p-1 eyebrow text-graphite hover:text-ink" aria-label="Close">
        Close ✕
      </BaseDialog.Close>
    </div>
  );
}

export function Modal({ open, onOpenChange, trigger, title, description, children, footer }: OverlayProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <BaseDialog.Trigger render={trigger} /> : null}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={backdrop} />
        <BaseDialog.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto bg-paper p-6 text-ink",
            "transition-[opacity,transform] duration-150 data-ending-style:opacity-0 data-starting-style:translate-y-[calc(-50%+8px)] data-starting-style:opacity-0",
          )}
        >
          <Header title={title} description={description} />
          <div className="flex flex-col gap-4">{children}</div>
          {footer ? (
            <div className="flex flex-wrap justify-end gap-3 border-t border-rule pt-4">{footer}</div>
          ) : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export function Sheet({ open, onOpenChange, trigger, title, description, children, footer }: OverlayProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <BaseDialog.Trigger render={trigger} /> : null}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={backdrop} />
        <BaseDialog.Popup
          className={cn(
            "fixed z-50 flex flex-col bg-paper text-ink",
            "inset-x-0 bottom-0 max-h-[88dvh] border-t border-ink",
            "md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[28rem] md:border-t-0 md:border-l",
            "transition-transform duration-200 ease-(--ease-editorial) data-ending-style:translate-y-full data-starting-style:translate-y-full md:data-ending-style:translate-x-full md:data-ending-style:translate-y-0 md:data-starting-style:translate-x-full md:data-starting-style:translate-y-0",
          )}
        >
          <div className="p-6 pb-0">
            <Header title={title} description={description} />
          </div>
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
          {footer ? <div className="flex gap-3 border-t border-rule p-6">{footer}</div> : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export const OverlayClose = BaseDialog.Close;
