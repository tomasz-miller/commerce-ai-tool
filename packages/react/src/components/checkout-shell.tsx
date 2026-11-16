import { createElement, type ReactNode } from "react";
import type { ThemeMode } from "@commerce-ai-tool/core/client";

/** What `renderLink` receives: the anchor a plain `<a>` would get. */
export interface CommerceAILinkProps {
  href: string;
  className: string;
  children: ReactNode;
}

/** Element the checkout and order-status widgets render as their root. */
export type CommerceAIRootElement = "main" | "section" | "div";

export type CommerceAIHeadingLevel = 1 | 2 | 3;

/** Landmark, heading and navigation options shared by the checkout and order-status widgets. */
export interface CommerceAIPageOptions {
  /**
   * Root element. Defaults to `"section"`: the host page owns the `<main>` landmark. Pass `"main"`
   * only when the widget is the whole page content.
   */
  as?: CommerceAIRootElement;
  /**
   * Tag level of the widget's title (`h1` to `h3`). Defaults to 2, under the host's page `<h1>`.
   * Section headings inside the widget follow one level below.
   */
  headingLevel?: CommerceAIHeadingLevel;
  /**
   * Renders every navigation link (continue shopping, order status). Defaults to a plain `<a>`;
   * pass your router's link (for example `next/link`) to navigate without a full page load.
   */
  renderLink?: (props: CommerceAILinkProps) => ReactNode;
}

export type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

function headingTag(level: number): HeadingTag {
  return `h${Math.min(Math.max(level, 1), 6)}` as HeadingTag;
}

/** Heading tag levels of a widget: the title, the sections under it and their sub-sections. */
export function headingTags(headingLevel: CommerceAIHeadingLevel) {
  // A value outside 1 to 3 (plain JavaScript, a cast) falls back to the default instead of
  // rendering a bogus tag.
  const level = headingLevel === 1 || headingLevel === 2 || headingLevel === 3 ? headingLevel : 2;
  return {
    title: headingTag(level),
    section: headingTag(level + 1),
    subsection: headingTag(level + 2),
  };
}

const ROOT_ELEMENTS: readonly CommerceAIRootElement[] = ["main", "section", "div"];

export function CheckoutRoot({
  as,
  theme,
  titleId,
  children,
}: {
  as?: CommerceAIRootElement;
  theme: ThemeMode;
  /** Id of the title heading. Names the region when the root is a `<section>` or `<main>`. */
  titleId: string;
  children: ReactNode;
}) {
  const Root = as && ROOT_ELEMENTS.includes(as) ? as : "section";
  return createElement(
    Root,
    {
      className: "cat-root cat-checkout",
      "data-theme": theme,
      // A bare <div> has no role, so it takes no accessible name.
      "aria-labelledby": Root === "div" ? undefined : titleId,
    },
    children,
  );
}

/** A heading element chosen by tag at runtime. */
export function Heading({
  tag,
  id,
  className,
  children,
}: {
  tag: HeadingTag;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return createElement(tag, { id, className }, children);
}

export function PageLink({
  renderLink,
  href,
  className,
  children,
}: {
  renderLink?: CommerceAIPageOptions["renderLink"];
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (renderLink) {
    return <>{renderLink({ href, className, children })}</>;
  }
  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
}
