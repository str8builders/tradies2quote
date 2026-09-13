import Link from "next/link";
import { Plus, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
const FAQS = [
  {
    slug: "tech-skill",
    q: "Do I need to be good with technology?",
    a: "You can start with a voice note or a typed description of the job. Tradies2Quote creates a draft for you to check, edit and send. You don't need to set up a spreadsheet or design a quote template.",
  },
  {
    slug: "edit-quote",
    q: "Can I change the quote before it goes out?",
    a: "Yes. Review and edit the line items, quantities, prices and terms. Nothing is sent to your client until you choose to send it.",
  },
  {
    slug: "regions",
    q: "Is it available where I work?",
    a: "We're starting in New Zealand, with NZD and 15% GST. Australia, the UK, the US and Canada are planned. The current launch is for NZ tradies.",
  },
  {
    slug: "trial",
    q: "How does the free trial work?",
    a: "You get 7 days to try Tradies2Quote without a credit card up front. Solo is $49 NZD a month including GST after the trial. You can cancel anytime.",
  },
  {
    slug: "phone",
    q: "Can I use it on my phone?",
    a: "Yes. Tradies2Quote runs in your phone's browser and can be added to your home screen. You can also sign in from a computer. T2QCAL is a separate web app for construction calculators. Open each app from this website and add each to your home screen; both use your Tradies2Quote account.",
  },
  {
    slug: "qr-code",
    q: "How does the QR code work?",
    a: "Turn on your request link in Settings and you get a QR code and a short link. Print the poster or put the code on your van, site signs or business cards. A client scans it with their phone camera, describes the job in their own words and can add a few photos. It arrives in your app as a request with a draft quote already written up, and you get a notification. You check the numbers and send it — nothing goes to the client until you do.",
  },
  {
    slug: "supplier-quote",
    q: "Can it read a supplier's quote?",
    a: "Yes. Photograph the quote or invoice, or pick the photos from your phone — every page of a long one. Tradies2Quote reads the lines so you can check each one, then adds the prices to your materials library or turns them straight into a quote with the same numbers. You can also import a CSV.",
  },
  {
    slug: "offline",
    q: "Does it work with no signal?",
    a: "T2QCAL does. Any calculator you have opened works offline, and the standards and manuals you keep on the phone open without reception. Saving to your account and sending a quantity to a quote need a connection, and so does Tradies2Quote itself.",
  },
  {
    slug: "replaces-jms",
    q: "Does it replace my entire business system?",
    a: "Tradies2Quote focuses on quotes, invoices, clients and your material rates, with lightweight scheduling. Keep using the tools you need for accounting and wider job management.",
  },
];
export function FAQ() {
  return (
    <section id="faq" data-testid="section-faq" className="studio-section">
      <div className="studio-container studio-faq-grid">
        <div>
          <div className="studio-eyebrow">07 / GOOD QUESTIONS</div>
          <h2>
            No jargon.
            <br />
            <em>Straight answers.</em>
          </h2>
          <p>Need a hand with something else?</p>
          <Link href="/support" className="studio-text-link">
            Talk to us <ArrowUpRight size={19} />
          </Link>
        </div>
        <div className="studio-faq-list">
          {FAQS.map(({ slug, q, a }) => (
            <details
              key={slug}
              data-testid={`faq-item-${slug}`}
              name="site-faq"
            >
              <summary data-testid={`faq-toggle-${slug}`}>
                {q}
                <Plus size={20} weight="bold" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
