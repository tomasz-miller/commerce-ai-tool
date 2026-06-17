import { DemoSearch } from "../components/DemoSearch";

export default function HomePage() {
  return (
    <main className="demo-page">
      <div className="demo-hero">
        <h1>Commerce AI Tool</h1>
        <p>AI-powered product search for commercetools</p>
      </div>

      <DemoSearch />
    </main>
  );
}
