import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  type ReactNode,
} from "react";
import type { Resource } from "../resource";
export function State({
  loading,
  error,
  empty,
  children,
  onRetry,
}: {
  loading?: boolean;
  error?: string;
  empty?: string;
  children?: ReactNode;
  onRetry?: () => void;
}) {
  if (loading)
    return (
      <div className="pc-state" role="status" aria-live="polite">
        Loading verified observations…
      </div>
    );
  if (error)
    return (
      <div className="pc-state" role="alert">
        <h2>Unable to load this view</h2>
        <p>{error}</p>
        {onRetry && (
          <button className="pc-button pc-primary" onClick={onRetry}>
            Retry view
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="pc-state" role="status">
        <h2>No observations available</h2>
        <p>{empty}</p>
      </div>
    );
  return children;
}
export function ResourceState<T>({
  resource,
  children,
}: {
  resource: Resource<T>;
  children: (data: T) => ReactNode;
}) {
  return (
    <State
      loading={resource.loading}
      error={resource.error}
      onRetry={resource.retry}
    >
      {resource.data !== undefined ? children(resource.data) : null}
    </State>
  );
}
export function Panel({
  title,
  description,
  onClose,
  children,
  light = true,
  className = "",
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  light?: boolean;
  className?: string;
}) {
  const opener = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="pc-overlay" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
          }}
          className={`pc-panel ${light ? "pc-canvas" : "pc-dark-panel"} ${className}`}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          {children}
          <Dialog.Close
            className="pc-panel-close pc-icon"
            aria-label="Close panel"
          >
            <X />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="pc-field">
      <label htmlFor={id}>{label}</label>
      {isValidElement<{ id?: string }>(children)
        ? cloneElement(children, { id })
        : children}
    </div>
  );
}
