import { DemoSearch } from "../components/DemoSearch";

export default function HomePage() {
  return (
    <main className="demo-page">
      <div className="demo-hero">
        <h1 className="demo-hero-title">
          <span className="demo-hero-word demo-hero-word--muted">Commerce</span>
          <span className="demo-hero-word demo-hero-word--emphasis">AI</span>
          <span className="demo-hero-word demo-hero-word--muted">tool</span>
        </h1>
        <p>AI-powered product search for commercetools</p>
      </div>

      <DemoSearch />
    </main>
  );
}
