export function exampleAssetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "");
  if (!clean) return "/example-assets";
  return `/example-assets/${clean.split("/").map(encodeURIComponent).join("/")}`;
}

export function mimeFromAssetPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}
