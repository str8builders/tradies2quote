import { DirectoryExplorer } from "@/t2qcal/components/DirectoryExplorer";

export default function CalculatorsPage() {
  return (
    <main className="directory-page">
      <section className="page-intro">
        <div className="eyebrow"><span /> Calculator directory</div>
        <h1>Construction calculators</h1>
        <p>Measure, check the live drawing and save your working with your Tradies2Quote account.</p>
      </section>
      <DirectoryExplorer />
    </main>
  );
}
