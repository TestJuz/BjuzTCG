import type { CatalogCard } from "../types";

type ImageLookupCard = Pick<CatalogCard, "name"> & Partial<Pick<CatalogCard, "set" | "setName">>;

type MagicApiCard = {
  name: string;
  set?: string;
  setName?: string;
  imageUrl?: string;
};

type MagicApiResponse = {
  cards?: MagicApiCard[];
};

type ScryfallCard = {
  name: string;
  set?: string;
  image_uris?: {
    normal?: string;
    large?: string;
    png?: string;
  };
  card_faces?: Array<{
    image_uris?: {
      normal?: string;
      large?: string;
      png?: string;
    };
  }>;
};

type ScryfallSearchResponse = {
  data?: ScryfallCard[];
};

const API_URL = "https://api.magicthegathering.io/v1/cards";
const SCRYFALL_SEARCH_URL = "https://api.scryfall.com/cards/search";
const imageCache = new Map<string, string | null>();

const normalize = (value = "") => value.trim().toLowerCase();

const buildCacheKey = (card: ImageLookupCard) =>
  `${normalize(card.name)}::${normalize(card.set)}::${normalize(card.setName)}`;

const toHttps = (url: string) => url.replace(/^http:\/\//, "https://");

const buildMagicApiUrl = (card: ImageLookupCard, useSetName = false) => {
  const params = new URLSearchParams({
    name: card.name,
    contains: "imageUrl",
    pageSize: "10",
  });

  if (card.set || card.setName) {
    params.set(useSetName ? "setName" : "set", useSetName ? card.setName ?? card.set ?? "" : card.set ?? "");
  }

  return `${API_URL}?${params.toString()}`;
};

const chooseBestMagicApiImage = (cards: MagicApiCard[], wanted: ImageLookupCard) => {
  const exactName = normalize(wanted.name);
  const exactSet = normalize(wanted.set);
  const exactSetName = normalize(wanted.setName);

  return (
    cards.find(
      (card) =>
        normalize(card.name) === exactName &&
        (!exactSet ||
          normalize(card.set) === exactSet ||
          normalize(card.setName) === exactSet ||
          normalize(card.setName) === exactSetName) &&
        card.imageUrl
    )?.imageUrl ??
    cards.find((card) => normalize(card.name) === exactName && card.imageUrl)?.imageUrl ??
    cards.find((card) => card.imageUrl)?.imageUrl ??
    null
  );
};

const fetchImageFromMagicApi = async (card: ImageLookupCard, useSetName = false) => {
  const response = await fetch(buildMagicApiUrl(card, useSetName));

  if (!response.ok) {
    throw new Error(`Magic API responded with ${response.status}`);
  }

  const data = (await response.json()) as MagicApiResponse;
  const imageUrl = chooseBestMagicApiImage(data.cards ?? [], card);
  return imageUrl ? toHttps(imageUrl) : null;
};

const getScryfallImage = (card: ScryfallCard) => {
  const imageUrl =
    card.image_uris?.normal ??
    card.image_uris?.large ??
    card.image_uris?.png ??
    card.card_faces?.[0]?.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.large ??
    card.card_faces?.[0]?.image_uris?.png;

  return imageUrl ? toHttps(imageUrl) : null;
};

const fetchImageFromScryfall = async (card: ImageLookupCard, includeSet = true) => {
  const exactName = `"${card.name.replace(/"/g, '\\"')}"`;
  const setCode = normalize(card.set);
  const query =
    includeSet && setCode
      ? `!${exactName} set:${setCode} unique:prints`
      : `!${exactName} unique:prints`;

  const params = new URLSearchParams({ q: query });
  const response = await fetch(`${SCRYFALL_SEARCH_URL}?${params.toString()}`);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }

    throw new Error(`Scryfall responded with ${response.status}`);
  }

  const data = (await response.json()) as ScryfallSearchResponse;
  const exactSet = normalize(card.set);
  const exactNameNormalized = normalize(card.name);
  const exactMatch =
    data.data?.find(
      (result) =>
        normalize(result.name) === exactNameNormalized &&
        (!exactSet || normalize(result.set) === exactSet) &&
        getScryfallImage(result)
    ) ?? data.data?.find((result) => getScryfallImage(result));

  return exactMatch ? getScryfallImage(exactMatch) : null;
};

export const resolveCardImage = async (card: ImageLookupCard) => {
  const cacheKey = buildCacheKey(card);

  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey) ?? undefined;
  }

  const stored = localStorage.getItem(`mtg-image:${cacheKey}`);
  if (stored) {
    imageCache.set(cacheKey, stored);
    return stored;
  }

  let imageUrl = await fetchImageFromMagicApi(card);

  if (!imageUrl && card.setName) {
    imageUrl = await fetchImageFromMagicApi(card, true);
  }

  if (!imageUrl) {
    imageUrl = await fetchImageFromScryfall(card, true);
  }

  if (!imageUrl) {
    imageUrl = await fetchImageFromScryfall(card, false);
  }

  imageCache.set(cacheKey, imageUrl);

  if (imageUrl) {
    localStorage.setItem(`mtg-image:${cacheKey}`, imageUrl);
  }

  return imageUrl ?? undefined;
};
