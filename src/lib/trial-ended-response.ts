import "server-only";
import { NextResponse } from "next/server";
import { isNativeShellRequest } from "@/lib/native-shell";
import { NEW_QUOTES_PAUSED } from "@/lib/trial-ended";

/**
 * The 402 an AI route answers with once the free trial has ended.
 *
 * The website gets the route's own sentence and the plans link, exactly as
 * before. The iPhone app gets only "New quotes are paused on this account.":
 * no subscribe wording and no link to the plans page (App Store 3.1.3(f)).
 */
export async function trialEndedResponse(webMessage: string): Promise<NextResponse> {
  const body = (await isNativeShellRequest())
    ? { error: "trial_expired", message: NEW_QUOTES_PAUSED }
    : { error: "trial_expired", message: webMessage, upgrade_url: "/app/upgrade" };
  return NextResponse.json(body, { status: 402 });
}
