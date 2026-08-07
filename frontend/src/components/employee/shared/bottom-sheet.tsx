'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const BottomSheetRoot = DialogPrimitive.Root;
const BottomSheetTrigger = DialogPrimitive.Trigger;
const BottomSheetClose = DialogPrimitive.Close;

const BottomSheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
BottomSheetOverlay.displayName = 'BottomSheetOverlay';

interface BottomSheetContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  title?: string;
  showCloseButton?: boolean;
}

const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  BottomSheetContentProps
>(({ className, children, title, showCloseButton = true, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <BottomSheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed bottom-0 left-1/2 -translate-x-1/2 z-50',
        'w-full max-w-lg bg-background rounded-t-2xl shadow-2xl',
        'max-h-[92dvh] flex flex-col',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        'duration-300',
        className,
      )}
      {...props}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="h-1 w-10 rounded-full bg-muted-foreground/25" />
      </div>

      {/* Header */}
      {(title || showCloseButton) && (
        <div className="flex items-center justify-between px-5 pt-2 pb-4 flex-shrink-0">
          {title && (
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              {title}
            </DialogPrimitive.Title>
          )}
          {showCloseButton && (
            <DialogPrimitive.Close className="ml-auto flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
BottomSheetContent.displayName = 'BottomSheetContent';

export {
  BottomSheetRoot as BottomSheet,
  BottomSheetTrigger,
  BottomSheetClose,
  BottomSheetContent,
};
