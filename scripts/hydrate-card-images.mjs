import { readFile, writeFile } from "node:fs/promises";

const API_URL = "https://api.magicthegathering.io/v1/cards";
const SCRYFALL_SEARCH_URL = "https://api.scryfall.com/cards/search";
const catalogUrl = new URL("../public/catalog.json", import.meta.url);

const normalize = (value = "") => value.trim().toLowerCase();
const toHttps = (url) => url.replace(/^http:\/\//, "https://");

const buildUrl = (card, useSetName = false) => {
  const params = new URLSearchParams({
    name: card.name,
    contains: "imageUrl",
    pageSize: "10",
  });

  if (!card.set && !card.setName) {
    return `${API_URL}?${params.toString()}`;
  }

  if (useSetName) {
    params.set("setName", card.setName || card.set);
  } else {
    params.set("set", card.set);
  }

  return `${API_URL}?${params.toString()}`;
};

const chooseBestImage = (cards, wanted) => {
  const exactName = normalize(wanted.name);
  const exactSet = normalize(wanted.set);
  const exactSetName = normalize(wanted.setName);

  const imageUrl =
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
    cards.find((card) => card.imageUrl)?.imageUrl;

  return imageUrl ? toHttps(imageUrl) : "";
};

const fetchImage = async (card, useSetName = false) => {
  const response = await fetch(buildUrl(card, useSetName));

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return chooseBestImage(data.cards ?? [], card);
};

const getScryfallImage = (card) => {
  const imageUrl =
    card.image_uris?.normal ??
    card.image_uris?.large ??
    card.image_uris?.png ??
    card.card_faces?.[0]?.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.large ??
    card.card_faces?.[0]?.image_uris?.png;

  return imageUrl ? toHttps(imageUrl) : "";
};

const fetchScryfallImage = async (card, includeSet = true) => {
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
      return "";
    }

    throw new Error(`${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const exactSet = normalize(card.set);
  const exactNameNormalized = normalize(card.name);
  const exactMatch =
    data.data?.find(
      (result) =>
        normalize(result.name) === exactNameNormalized &&
        (!exactSet || normalize(result.set) === exactSet) &&
        getScryfallImage(result)
    ) ?? data.data?.find((result) => getScryfallImage(result));

  return exactMatch ? getScryfallImage(exactMatch) : "";
};

const hydrateCard = async (card) => {
  if (card.imageUrl) {
    return card;
  }

  let imageUrl = await fetchImage(card);

  if (!imageUrl && card.setName) {
    imageUrl = await fetchImage(card, true);
  }

  if (!imageUrl) {
    imageUrl = await fetchScryfallImage(card, true);
  }

  if (!imageUrl) {
    imageUrl = await fetchScryfallImage(card, false);
  }

  return imageUrl ? { ...card, imageUrl } : card;
};

const run = async () => {
  const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
  let updated = 0;
  let missing = 0;

  const hydrated = [];

  for (const card of catalog) {
    if (card.imageUrl) {
      hydrated.push(card);
      continue;
    }

    process.stdout.write(`Buscando imagen: ${card.name} (${card.set})... `);

    try {
      const nextCard = await hydrateCard(card);

      if (nextCard.imageUrl) {
        updated += 1;
        console.log("ok");
      } else {
        missing += 1;
        console.log("sin imagen");
      }

      hydrated.push(nextCard);
    } catch (error) {
      missing += 1;
      console.log(`error: ${error.message}`);
      hydrated.push(card);
    }
  }

  await writeFile(catalogUrl, `${JSON.stringify(hydrated, null, 2)}\n`);

  console.log(`\nListo. Imagenes agregadas: ${updated}. Sin resolver: ${missing}.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
