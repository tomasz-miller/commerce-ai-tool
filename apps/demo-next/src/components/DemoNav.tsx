export function DemoNav({ current }: { current: "search" | "checkout" }) {
  return (
    <nav className="demo-nav" aria-label="Demo">
      <a href="/" aria-current={current === "search" ? "page" : undefined}>
        Search
      </a>
      <a href="/checkout" aria-current={current === "checkout" ? "page" : undefined}>
        Checkout
      </a>
    </nav>
  );
}
