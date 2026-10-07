/** Items listed on the public shelf (feed and /site). Talks an editor took off the Articles shelf are left out. */
export function onPublicShelf(item: { on_shelf?: boolean | null }): boolean {
  return item.on_shelf !== false;
}
