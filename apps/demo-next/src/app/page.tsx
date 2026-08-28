import { DemoNav } from "../components/DemoNav";
import { DemoSearch } from "../components/DemoSearch";

export default function HomePage() {
  return (
    <>
      <DemoNav current="search" />
      <main id="main" className="demo-page">
        <div className="demo-hero">
          <p className="demo-hero-eyebrow">Commercetools · AI search</p>
          <h1 className="demo-hero-title">
            <span className="demo-hero-word demo-hero-word--muted">Commerce</span>
            <span className="demo-hero-word demo-hero-word--emphasis">AI tool</span>
          </h1>
          <p>Search the catalog by text, voice, or image — then take the cart through checkout.</p>
        </div>

        <div id="demo-search" className="demo-search">
          <DemoSearch />
        </div>
      </main>
    </>
  );
}
