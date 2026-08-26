import { describe, expect, it } from "vitest";
import { authorSlug, canonicalAuthor } from "@/lib/authors";

/**
 * Every case here is a real author name the generator produced. The library
 * came back with one coach split across several pages because the model
 * qualifies names inconsistently between runs, which is exactly the kind of
 * thing that silently degrades as the library grows.
 */

describe("canonicalAuthor", () => {
  it("drops a trailing parenthetical qualifier", () => {
    expect(canonicalAuthor("Mark Rippetoe (popularized with Glenn Pendlay)")).toBe(
      "Mark Rippetoe",
    );
    expect(canonicalAuthor("Sergey Smolov (popularized by online strength community)")).toBe(
      "Sergey Smolov",
    );
    expect(canonicalAuthor("Bill Starr (adapted by 'Madcow')")).toBe("Bill Starr");
  });

  it("leaves an unqualified name alone", () => {
    expect(canonicalAuthor("John Meadows")).toBe("John Meadows");
    expect(canonicalAuthor("Arnold Schwarzenegger")).toBe("Arnold Schwarzenegger");
  });

  it("only strips a parenthetical at the end, not one mid-name", () => {
    expect(canonicalAuthor("5/3/1 (BBB) by Wendler")).toBe("5/3/1 (BBB) by Wendler");
  });

  it("keeps the original when the name is nothing but a parenthetical", () => {
    // Better a slightly odd author page than an empty one.
    expect(canonicalAuthor("(unknown)")).toBe("(unknown)");
  });

  it("collapses the variants onto one slug, which is the whole point", () => {
    expect(authorSlug("Sergey Smolov")).toBe(
      authorSlug("Sergey Smolov (popularized by online strength community)"),
    );
    expect(authorSlug("Mark Rippetoe")).toBe(
      authorSlug("Mark Rippetoe (popularized with Glenn Pendlay)"),
    );
  });

  it("keeps genuinely different coaches apart", () => {
    expect(authorSlug("John Meadows")).not.toBe(authorSlug("Mike Mentzer"));
  });
});
