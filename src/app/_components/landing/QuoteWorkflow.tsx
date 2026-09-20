"use client";
import Image from "next/image";
import { useRef, useState, type KeyboardEvent } from "react";
import {
  Microphone,
  PencilSimple,
  FileText,
  Check,
  ArrowRight,
} from "@phosphor-icons/react";
import Link from "next/link";
const VIEWS = [
  {
    id: "capture",
    label: "Capture",
    icon: Microphone,
    title: "Good notes make great quotes.",
    body: "Record what you see while the job is still in front of you. Voice, text and scan give you three ways to get started.",
    points: [
      "Record a walkthrough on your phone",
      "Type a job description at your desk",
      "Upload a plan or handwritten notes",
    ],
    image: "/screens/screen-4.jpg",
    alt: "Existing Tradies2Quote voice, type and scan input screen",
  },
  {
    id: "review",
    label: "Review",
    icon: PencilSimple,
    title: "Every detail. Your decision.",
    body: "Check the scope, quantities, labour and prices in an editable draft. Your experience has the final say.",
    points: [
      "Search and sort materials and labour",
      "Check flagged supplier lines, markup and GST",
      "Undo review edits before you send",
    ],
    image: "/screens/screen-6.jpg",
    alt: "Existing Tradies2Quote draft editor with item totals and GST",
  },
  {
    id: "send",
    label: "Send",
    icon: FileText,
    title: "Paperwork you can be proud of.",
    body: "Send your client a quote that looks as professional as the work. Keep its progress together with your invoices.",
    points: [
      "Your business branding and terms",
      "Share a client-ready quote",
      "Convert the job to an invoice",
    ],
    image: "/screens/screen-8.jpg",
    alt: "Existing Tradies2Quote branded quote preview",
  },
];
export function QuoteWorkflow() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const view = VIEWS[active];
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % VIEWS.length;
    else if (event.key === "ArrowLeft")
      next = (index + VIEWS.length - 1) % VIEWS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = VIEWS.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }
  return (
    <section
      className="studio-section studio-tour-section"
      id="workflow"
      data-testid="section-quote-workflow"
    >
      <div className="studio-container studio-tour">
        <div className="studio-tour-copy">
          <div className="studio-eyebrow">A CLOSER LOOK / THE ACTUAL APP</div>
          <div
            className="studio-tabs"
            role="tablist"
            aria-label="Explore the quoting workflow"
          >
            {VIEWS.map(({ id, label, icon: Icon }, i) => (
              <button
                type="button"
                role="tab"
                key={id}
                id={`workflow-tab-${id}`}
                aria-selected={i === active}
                aria-controls="workflow-panel"
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKey(e, i)}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </div>
          <div
            id="workflow-panel"
            role="tabpanel"
            aria-labelledby={`workflow-tab-${view.id}`}
            tabIndex={0}
          >
            <h2>{view.title}</h2>
            <p>{view.body}</p>
            <ul>
              {view.points.map((p) => (
                <li key={p}>
                  <Check size={17} />
                  {p}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="studio-text-link">
              Try it on your next job <ArrowRight size={19} />
            </Link>
          </div>
        </div>
        <div className="studio-tour-preview">
          <div className="studio-screen-frame">
            <Image
              key={view.image}
              src={view.image}
              alt={view.alt}
              width={720}
              height={1560}
              sizes="(max-width: 800px) 280px, 300px"
            />
          </div>
          <span>ACTUAL APP SCREEN · EXAMPLE DATA</span>
        </div>
      </div>
    </section>
  );
}
