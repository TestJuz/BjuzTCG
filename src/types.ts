export type CatalogCard = {
  id?: string;
  name: string;
  set: string;
  setName?: string;
  type?: string;
  foil?: boolean;
  price: number;
  imageUrl?: string;
  arteAlternativo?: boolean;
  condition?: string;
  quantity?: number;
  sold?: boolean;
};

export type DisplayCard = CatalogCard & {
  key: string;
  resolvedImageUrl?: string;
  imageStatus: "ready" | "loading" | "missing" | "error";
};
