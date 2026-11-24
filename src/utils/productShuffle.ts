export function shuffleProductIds(
  ids: string[],
  avoidSameOrderAs?: string[]
): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const rawId of ids) {
    const id = String(rawId || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  if (unique.length <= 1) {
    return unique;
  }

  const runFisherYates = (source: string[]): string[] => {
    const copy = [...source];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  };

  let candidate = runFisherYates(unique);

  if (Array.isArray(avoidSameOrderAs) && avoidSameOrderAs.length > 0) {
    const sameOrder = (a: string[], b: string[]) =>
      a.length === b.length && a.every((val, idx) => val === b[idx]);

    let attempts = 0;
    while (sameOrder(candidate, avoidSameOrderAs) && attempts < 6) {
      candidate = runFisherYates(unique);
      attempts += 1;
    }

    if (sameOrder(candidate, avoidSameOrderAs)) {
      const first = candidate[0];
      candidate[0] = candidate[1];
      candidate[1] = first;
    }
  }

  return candidate;
}

export function orderProductsByShuffleIds<T extends { id: string }>(
  products: T[],
  shuffleOrderIds: string[]
): T[] {
  if (!Array.isArray(products) || products.length === 0) {
    return [];
  }

  // Always deduplicate products by ID so no product can ever appear twice
  const byId = new Map<string, T>();
  const dedupedOriginal: T[] = [];
  for (const item of products) {
    if (!item || !item.id || byId.has(item.id)) continue;
    byId.set(item.id, item);
    dedupedOriginal.push(item);
  }

  if (!Array.isArray(shuffleOrderIds) || shuffleOrderIds.length === 0) {
    return dedupedOriginal;
  }

  const ordered: T[] = [];
  for (const rawId of shuffleOrderIds) {
    const id = String(rawId || '').trim();
    if (!id) continue;
    const matched = byId.get(id);
    if (matched) {
      ordered.push(matched);
      byId.delete(id);
    }
  }

  // Append any remaining/newly-added products that weren't in the stored shuffle array
  for (const leftover of dedupedOriginal) {
    if (byId.has(leftover.id)) {
      ordered.push(leftover);
      byId.delete(leftover.id);
    }
  }

  return ordered;
}
