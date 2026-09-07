import { InputHTMLAttributes, LabelHTMLAttributes, forwardRef, TextareaHTMLAttributes, useState } from "react";
import clsx from "clsx";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M2.5 2.5l15 15M8.16 8.16a2.5 2.5 0 0 0 3.53 3.54M6.12 6.13C3.7 7.36 1.5 10 1.5 10s3 6 8.5 6c1.4 0 2.62-.38 3.67-.94M12.2 4.4A9.4 9.4 0 0 0 10 4c5.5 0 8.5 6 8.5 6-.36.71-1.01 1.71-1.96 2.68"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, type, ...rest }, ref) => {
    // Only password fields get the reveal toggle; every other input type
    // renders exactly as before (same markup, no wrapping div) - this is a
    // pure UX addition, not a security control, so hiding it behind
    // `type === "password"` rather than a separate prop means the fix
    // applies to every existing password field in the app (login, register,
    // reset-password x2, staff invite) without touching those 5 pages.
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";

    const inputEl = (
      <input
        ref={ref}
        type={isPassword ? (showPassword ? "text" : "password") : type}
        className={clsx(
          "w-full rounded border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint",
          error ? "border-danger" : "border-border-strong",
          isPassword && "pr-9",
          className,
        )}
        {...rest}
      />
    );

    return (
      <div className="flex flex-col gap-1">
        {isPassword ? (
          <div className="relative">
            {inputEl}
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-faint transition-colors hover:text-ink-muted"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOffIcon className="h-4 w-4" />
              ) : (
                <EyeIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        ) : (
          inputEl
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  },
);
Input.displayName = "Input";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...rest }, ref) => (
    <div className="flex flex-col gap-1">
      <textarea
        ref={ref}
        className={clsx(
          "w-full rounded border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint",
          error ? "border-danger" : "border-border-strong",
          className,
        )}
        {...rest}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  ),
);
Textarea.displayName = "Textarea";

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="text-xs font-medium text-ink-muted" {...props} />;
}

interface FieldProps {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
