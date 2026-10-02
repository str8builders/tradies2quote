"use client";

import { useId, useState, type ReactNode, type Ref } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";

/**
 * One labelled field on the sign-in pages (login, sign-up, forgot and reset
 * password). The label sits above the box in plain words, the box has an edge
 * you can see, and a password field gets a Show / Hide button with the word on
 * it (a bare eye icon is easy to miss and hard to hit). The look is in
 * redesign.css, "Sign-in pages", on the data-auth-* hooks below.
 */
export interface AuthFieldProps {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  testId?: string;
  /** A decorative icon element shown before the text. */
  icon?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  /** Test id for the Show / Hide button of a password field. */
  toggleTestId?: string;
  /** A short line under the box ("At least 8 characters."). */
  hint?: ReactNode;
}

export function AuthField({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  defaultValue,
  testId,
  icon,
  inputRef,
  toggleTestId,
  hint,
}: AuthFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  return (
    <div data-auth-field>
      <label htmlFor={id} data-auth-label>
        {label}
      </label>
      <div data-auth-box>
        {icon}
        <input
          id={id}
          ref={inputRef}
          name={name}
          type={isPassword && shown ? "text" : type}
          autoComplete={autoComplete}
          required={required}
          defaultValue={defaultValue}
          data-testid={testId}
          data-auth-input
          // Nothing here should be capitalised, corrected or spell-checked.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={hint ? hintId : undefined}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Hide password" : "Show password"}
            data-auth-toggle
            data-testid={toggleTestId}
          >
            {shown ? <EyeSlash aria-hidden="true" size={22} weight="bold" /> : <Eye aria-hidden="true" size={22} weight="bold" />}
            <span aria-hidden="true">{shown ? "Hide" : "Show"}</span>
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} data-auth-hint>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
