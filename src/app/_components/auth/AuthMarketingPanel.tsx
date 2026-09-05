import Image from "next/image";
import { Check } from "@phosphor-icons/react/dist/ssr";
export function AuthMarketingPanel({ kind }: { kind: "signin" | "signup" }) {
  return (
    <div className="studio-auth-story">
      <div className="studio-eyebrow">
        <span className="studio-status-dot" /> BUILT ON SITE. MADE FOR YOU.
      </div>
      <h2>
        {kind === "signin" ? (
          <>
            Back to business.
            <br />
            <em>Less busywork.</em>
          </>
        ) : (
          <>
            Your trade.
            <br />
            Your business.
            <br />
            <em>Your time back.</em>
          </>
        )}
      </h2>
      <p>
        Professional quotes from the notes you already take. Capture the job,
        check the details, and put your name on it.
      </p>
      <ul>
        {[
          "Voice, typed notes or scanned plans",
          "Your rates, your branding, your terms",
          "Nothing sent without your say-so",
        ].map((t) => (
          <li key={t}>
            <Check size={17} />
            {t}
          </li>
        ))}
      </ul>
      <div className="studio-auth-photo">
        <Image
          src="/images/worksite.webp"
          alt="Carpenter measuring timber at a residential building site"
          fill
          sizes="50vw"
        />
        <div />
        <span>MADE FOR THE PEOPLE WHO BUILD IT.</span>
      </div>
    </div>
  );
}
