import { isNativeShellRequest } from "@/lib/native-shell";
import { shouldOfferCalculatorApp } from "@/lib/calculator-app";
import OpenCalculator from "./OpenCalculator";

/**
 * The gate in front of the T2QCAL launch button.
 *
 * ## Why the App Store binary is treated differently
 *
 * Guideline 2.5.2 stops an App Store app pointing people at software that is
 * not itself on the App Store. T2QCAL is currently signed with a free
 * provisioning profile — it expires in seven days and has never been through
 * review — so a button inside the shell offering to open it is exactly the
 * thing that guideline forbids. On the open web there is no such restriction:
 * a browser can link anywhere, and the button falls back to the App Store page
 * for anyone who does not have the app.
 *
 * So the shell only gets this button once T2QCAL is genuinely live, and that
 * moment is a single environment variable rather than a code change:
 *
 *     NEXT_PUBLIC_T2QCAL_APPSTORE_URL=https://apps.apple.com/app/idXXXXXXXXX
 *
 * Setting it does two jobs at once — it turns the button on inside the shell,
 * and it gives the web version somewhere to send people who have not installed
 * it. Both are true only when the app is actually on the store, which is why
 * one variable can honestly govern both.
 *
 * The direction of failure is deliberate: with the variable unset the button
 * is simply absent from the shell. A missing button is a small loss; a button
 * that breaks 2.5.2 is a rejected binary.
 */
export default async function CalculatorLaunch({
  route,
  className,
}: {
  route?: string;
  className?: string;
}) {
  const nativeShell = await isNativeShellRequest();
  const offer = shouldOfferCalculatorApp({
    nativeShell,
    appStoreUrl: process.env.NEXT_PUBLIC_T2QCAL_APPSTORE_URL,
  });

  if (!offer) return null;

  return <OpenCalculator route={route} className={className} />;
}
