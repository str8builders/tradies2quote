import { cookies } from "next/headers";
import { TextSizeControl } from "@/components/ui/text-size-control";
import { TEXT_SIZE_COOKIE, parseTextSizeValue } from "@/lib/ui/text-size";

/**
 * Text size on the sign-in pages, so someone who finds the words too small can
 * make them bigger before they have signed in. It is the same per-device
 * setting as in the app (the t2q-text cookie), applied here by the auth
 * layout's data-text, so the choice follows them in and out.
 */
export async function AuthTextSize() {
  const size = parseTextSizeValue((await cookies()).get(TEXT_SIZE_COOKIE)?.value);
  return (
    <div data-auth-textsize>
      <TextSizeControl initial={size} label="Text size" />
    </div>
  );
}
