const MAX_ENTITY_LEN = 20;

function decodeBasicEntities(input: string) {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d{1,6});/g, (_m, num) => {
      const n = Number(num);
      if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
      return String.fromCodePoint(n);
    })
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_m, hex) => {
      const n = Number.parseInt(hex, 16);
      if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
      return String.fromCodePoint(n);
    });
}

export function htmlToSafeText(html: string) {
  // Defensive: strip scripts/styles and images (tracking pixels), then strip tags.
  let s = html;
  s = s.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, " ");
  s = s.replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, " ");
  s = s.replace(/<\s*img\b[^>]*>/gi, " ");
  s = s.replace(/<\s*iframe[\s\S]*?<\s*\/\s*iframe\s*>/gi, " ");
  s = s.replace(/<\s*noscript[\s\S]*?<\s*\/\s*noscript\s*>/gi, " ");
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  s = s.replace(/<\s*\/\s*p\s*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");

  // Decode a small set of entities (avoid heavy HTML parsing)
  // Also avoid pathological entity expansions by limiting entity token size.
  s = s.replace(new RegExp(`&[^\s;]{1,${MAX_ENTITY_LEN}};`, "g"), (m) => decodeBasicEntities(m));
  s = decodeBasicEntities(s);

  // Collapse whitespace
  s = s.replace(/\r\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[\t\f\v]+/g, " ");
  s = s.replace(/ {2,}/g, " ");
  return s.trim();
}
