import { forwardRef, useCallback, useLayoutEffect, useRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: "sm" | "md"; invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, size = "md", invalid, ...props }, ref) {
  return <input ref={ref} className={cn("ui-input", size === "sm" && "ui-control--sm", className)} aria-invalid={invalid || undefined} {...props} />;
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Rows it never shrinks below, and rows past which it scrolls instead of growing. */
  minRows?: number;
  maxRows?: number;
  invalid?: boolean;
};

/* A text box that grows with what is written in it, up to `maxRows`, and is never resized by hand. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, minRows = 3, maxRows = 10, invalid, onInput, value, ...props }, ref) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback((node: HTMLTextAreaElement | null) => {
    own.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  const fit = useCallback(() => {
    const node = own.current;
    if (!node) return;
    const style = getComputedStyle(node);
    const line = parseFloat(style.lineHeight) || 20;
    const chrome = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    node.style.height = "auto";
    const height = Math.min(Math.max(node.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth), minRows * line + chrome), maxRows * line + chrome);
    node.style.height = height + "px";
    node.style.overflowY = node.scrollHeight > height ? "auto" : "hidden";
  }, [minRows, maxRows]);
  useLayoutEffect(fit, [fit, value]);
  return <textarea ref={setRef} rows={minRows} value={value} className={cn("ui-textarea", className)} aria-invalid={invalid || undefined}
    onInput={(event) => { fit(); onInput?.(event); }} {...props} />;
});
