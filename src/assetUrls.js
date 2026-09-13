const files = import.meta.glob("./assets/{data,files}/**/*", {
  query: "?url",
  import: "default",
  eager: true,
});

export const assetUrls = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice(2), url]),
);
