import type {ComponentProps} from "react";
/** Adapted from shadcn/ui Input (MIT). See THIRD_PARTY_NOTICES.md. */
export function Input({className,type,...props}:ComponentProps<"input">){
  return <input type={type} data-slot="input" className={["mt-2 block min-h-11 w-full min-w-0 rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-base text-white outline-none placeholder:text-ink-400 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-400",className].filter(Boolean).join(" ")} {...props}/>;
}
