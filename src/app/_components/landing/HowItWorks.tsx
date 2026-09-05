import {
  Microphone,
  PencilSimple,
  PaperPlaneTilt,
  Receipt,
} from "@phosphor-icons/react/dist/ssr";
const STEPS = [
  {
    n: "01",
    slug: "talk",
    title: "Talk the job.",
    body: "Record a site walkthrough, type a brief, or upload a plan. Start with what you already know.",
    icon: Microphone,
  },
  {
    n: "02",
    slug: "ai-builds",
    title: "Make it yours.",
    body: "Review the draft. Check quantities, set your rates, and fine-tune the details before it goes anywhere.",
    icon: PencilSimple,
  },
  {
    n: "03",
    slug: "send",
    title: "Send it with confidence.",
    body: "Share a clear, branded quote your client can read and accept from their phone.",
    icon: PaperPlaneTilt,
  },
  {
    n: "04",
    slug: "invoice",
    title: "Finish. Invoice. Repeat.",
    body: "Turn the accepted quote into an invoice when the work is done. Keep the job's paperwork together.",
    icon: Receipt,
  },
];
export function HowItWorks() {
  return (
    <section
      id="how"
      data-testid="section-how-it-works"
      className="studio-section"
    >
      <div className="studio-container">
        <div className="studio-section-heading">
          <div>
            <div className="studio-eyebrow">01 / A BETTER WAY TO QUOTE</div>
            <h2>
              From the job site.
              <br />
              <em>To their inbox.</em>
            </h2>
          </div>
          <p>
            Less time turning notes into numbers.
            <br />
            More time doing the work that matters.
          </p>
        </div>
        <div className="studio-steps">
          {STEPS.map(({ n, slug, title, body, icon: Icon }) => (
            <article key={n} data-testid={`how-step-${slug}`}>
              <div className="studio-step-top">
                <Icon size={25} weight="duotone" />
                <span>{n}</span>
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
