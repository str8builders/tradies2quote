import { notFound } from "next/navigation";
import "@/app/app/premium.css";
import { WelcomePreview } from "./WelcomePreview";

/** Local-only harness for the welcome intro. Never served in production. */
export default function DevWelcomePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <WelcomePreview />;
}
