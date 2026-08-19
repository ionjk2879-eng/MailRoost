import { describe, expect, it } from "vitest"
import { embedInlineMimeImages } from "./mime"

const rawWithInlineImage = [
  "Content-Type: multipart/related; boundary=mail-boundary",
  "",
  "--mail-boundary",
  "Content-Type: text/html; charset=utf-8",
  "",
  '<p>hello<img src="cid:hero-image"></p>',
  "--mail-boundary",
  "Content-Type: image/png",
  "Content-ID: <hero-image>",
  "Content-Transfer-Encoding: base64",
  "",
  "aGVsbG8=",
  "--mail-boundary--",
].join("\r\n")

describe("embedInlineMimeImages", () => {
  it("reuses inline image bytes from an already-fetched IMAP message", () => {
    expect(embedInlineMimeImages(rawWithInlineImage, '<img src="cid:hero-image">'))
      .toBe('<img src="data:image/png;base64,aGVsbG8=">')
  })

  it("leaves the cid URL in place when the response size limit would be exceeded", () => {
    expect(embedInlineMimeImages(rawWithInlineImage, '<img src="cid:hero-image">', 4))
      .toBe('<img src="cid:hero-image">')
  })
})
