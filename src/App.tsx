import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Check,
  Clipboard,
  Coins,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { resolveCardImage } from "./api/magicApi";
import type { CatalogCard, DisplayCard } from "./types";

type SortMode = "name" | "price-low" | "price-high";
type SelectedQuantities = Record<string, number>;

const currency = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
  maximumFractionDigits: 0,
});
const PAGE_SIZE = 9;
const logoUrl = `${import.meta.env.BASE_URL}logo.png`;

const getCardKey = (card: CatalogCard, index: number) =>
  card.id ?? `${card.name}-${card.set}-${index}`;

const normalizeCatalog = (cards: CatalogCard[]): DisplayCard[] =>
  cards.map((card, index) => ({
    ...card,
    key: getCardKey(card, index),
    quantity: card.quantity ?? 1,
    resolvedImageUrl: card.imageUrl || undefined,
    imageStatus: card.imageUrl ? "ready" : "loading",
  }));

const sortCards = (cards: DisplayCard[], sortMode: SortMode) => {
  return [...cards].sort((first, second) => {
    if (sortMode === "price-low") {
      return first.price - second.price;
    }

    if (sortMode === "price-high") {
      return second.price - first.price;
    }

    return first.name.localeCompare(second.name);
  });
};

export function App() {
  const [cards, setCards] = useState<DisplayCard[]>([]);
  const [selectedQuantities, setSelectedQuantities] = useState<SelectedQuantities>({});
  const [query, setQuery] = useState("");
  const [setFilter, setSetFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const imageRequests = useRef(new Set<string>());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}catalog.json`);

        if (!response.ok) {
          throw new Error("No se pudo leer public/catalog.json");
        }

        const catalog = (await response.json()) as CatalogCard[];
        setCards(normalizeCatalog(catalog));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Error inesperado");
      } finally {
        setLoadingCatalog(false);
      }
    };

    loadCatalog();
  }, []);

  const availableSets = useMemo(
    () =>
      [...new Set(cards.map((card) => card.set).filter(Boolean))].sort((first, second) =>
        first.localeCompare(second)
      ),
    [cards]
  );

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchingCards = cards.filter((card) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        card.name.toLowerCase().includes(normalizedQuery) ||
        card.set.toLowerCase().includes(normalizedQuery) ||
        card.setName?.toLowerCase().includes(normalizedQuery) ||
        card.type?.toLowerCase().includes(normalizedQuery) ||
        (card.foil ? "foil" : "non foil").includes(normalizedQuery);

      const matchesSet = setFilter === "all" || card.set === setFilter;

      return matchesQuery && matchesSet;
    });

    return sortCards(matchingCards, sortMode);
  }, [cards, query, setFilter, sortMode]);

  const visibleCards = useMemo(
    () => filteredCards.slice(0, visibleCount),
    [filteredCards, visibleCount]
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, setFilter, sortMode]);

  useEffect(() => {
    const loadMoreTarget = loadMoreRef.current;

    if (!loadMoreTarget || visibleCards.length >= filteredCards.length) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((currentCount) =>
            Math.min(currentCount + PAGE_SIZE, filteredCards.length)
          );
        }
      },
      { rootMargin: "500px 0px" }
    );

    observer.observe(loadMoreTarget);

    return () => observer.disconnect();
  }, [filteredCards.length, visibleCards.length]);

  useEffect(() => {
    const cardsWithoutImages = visibleCards.filter(
      (card) =>
        !card.imageUrl &&
        card.imageStatus === "loading" &&
        !imageRequests.current.has(card.key)
    );

    if (cardsWithoutImages.length === 0) {
      return;
    }

    let cancelled = false;

    cardsWithoutImages.forEach(async (card) => {
      imageRequests.current.add(card.key);

      try {
        const imageUrl = await resolveCardImage(card);

        if (cancelled) {
          return;
        }

        setCards((currentCards) =>
          currentCards.map((currentCard) =>
            currentCard.key === card.key
              ? {
                  ...currentCard,
                  resolvedImageUrl: imageUrl,
                  imageStatus: imageUrl ? "ready" : "missing",
                }
              : currentCard
          )
        );
      } catch {
        if (!cancelled) {
          setCards((currentCards) =>
            currentCards.map((currentCard) =>
              currentCard.key === card.key
                ? { ...currentCard, imageStatus: "error" }
                : currentCard
            )
          );
        }
      } finally {
        imageRequests.current.delete(card.key);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visibleCards]);

  const selectedCards = useMemo(
    () => cards.filter((card) => selectedQuantities[card.key]),
    [cards, selectedQuantities]
  );

  const selectedTotal = selectedCards.reduce(
    (total, card) => total + card.price * (selectedQuantities[card.key] ?? 0),
    0
  );
  const selectedItemCount = selectedCards.reduce(
    (total, card) => total + (selectedQuantities[card.key] ?? 0),
    0
  );
  const availableCount = cards.reduce(
    (total, card) => total + (card.sold ? 0 : card.quantity ?? 1),
    0
  );

  const toggleCard = (cardKey: string) => {
    setSelectedQuantities((currentQuantities) => {
      if (currentQuantities[cardKey]) {
        const { [cardKey]: _removed, ...remainingQuantities } = currentQuantities;
        return remainingQuantities;
      }

      return { ...currentQuantities, [cardKey]: 1 };
    });
  };

  const updateSelectedQuantity = (cardKey: string, nextQuantity: number) => {
    const card = cards.find((currentCard) => currentCard.key === cardKey);
    const maxQuantity = card?.quantity ?? 1;
    const safeQuantity = Math.max(0, Math.min(nextQuantity, maxQuantity));

    setSelectedQuantities((currentQuantities) => {
      if (safeQuantity === 0) {
        const { [cardKey]: _removed, ...remainingQuantities } = currentQuantities;
        return remainingQuantities;
      }

      return { ...currentQuantities, [cardKey]: safeQuantity };
    });
  };

  const copyOrder = async () => {
    const message = [
      "Hola, quiero comprar estas cartas:",
      ...selectedCards.map(
        (card) =>
          `- ${selectedQuantities[card.key]}x ${card.name} (${card.set}${
            card.type ? `, ${card.type}` : ""
          }${card.foil ? ", Foil" : ", Non foil"}) - ${currency.format(
            card.price * (selectedQuantities[card.key] ?? 0)
          )}`
      ),
      `Total: ${currency.format(selectedTotal)}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(message);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  };

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <img className="site-logo" src={logoUrl} alt="Magic TCG" />
          <p className="eyebrow">Venta privada</p>
          <h1>Magic TCG</h1>
          <p>
            Explora el catalogo, arma tu pedido y copia el mensaje para mandarlo
            por chat.
          </p>
        </div>

        <div className="hero-stats" aria-label="Resumen del catalogo">
          <div>
            <span>{cards.length}</span>
            <small>cartas</small>
          </div>
          <div>
            <span>{availableCount}</span>
            <small>disponibles</small>
          </div>
          <div>
            <span>{currency.format(selectedTotal)}</span>
            <small>{selectedItemCount} seleccionadas</small>
          </div>
        </div>
      </section>

      <section className="toolbar" aria-label="Filtros del catalogo">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar carta o set"
          />
        </label>

        <label className="select-control">
          <Sparkles size={17} aria-hidden="true" />
          <select value={setFilter} onChange={(event) => setSetFilter(event.target.value)}>
            <option value="all">Todos los sets</option>
            {availableSets.map((setCode) => (
              <option value={setCode} key={setCode}>
                {setCode}
              </option>
            ))}
          </select>
        </label>

        <label className="select-control">
          <ArrowUpDown size={17} aria-hidden="true" />
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
          >
            <option value="name">Nombre</option>
            <option value="price-low">Precio menor</option>
            <option value="price-high">Precio mayor</option>
          </select>
        </label>
      </section>

      {loadError ? <p className="status-message">{loadError}</p> : null}
      {loadingCatalog ? <p className="status-message">Cargando catalogo...</p> : null}

      <section className="content-grid">
        <div className="catalog-area">
          <div className="catalog-grid" aria-live="polite">
            {visibleCards.map((card, index) => {
              const isSelected = Boolean(selectedQuantities[card.key]);
              const stock = card.quantity ?? 1;

              return (
                <article className="card-tile" key={card.key}>
                  <button
                    className={`card-select ${isSelected ? "selected" : ""}`}
                    type="button"
                    onClick={() => toggleCard(card.key)}
                    disabled={card.sold}
                    title={card.sold ? "Carta vendida" : "Agregar o quitar del pedido"}
                  >
                    {isSelected ? <Check size={18} /> : <ShoppingBag size={18} />}
                  </button>

                  <div className="card-image-frame">
                    {card.resolvedImageUrl ? (
                      <img
                        src={card.resolvedImageUrl}
                        alt={card.name}
                        loading={index < 8 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={index < 4 ? "high" : "auto"}
                      />
                    ) : (
                      <div className="image-placeholder">
                        {card.imageStatus === "loading" ? (
                          <Loader2 size={26} className="spin" aria-label="Cargando imagen" />
                        ) : (
                          <span>Sin imagen</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="card-info">
                    <div>
                      <h2>{card.name}</h2>
                      <p>{card.setName ? `${card.setName} (${card.set})` : card.set}</p>
                      <div className="card-tags">
                        {card.type ? <span className="type-pill">{card.type}</span> : null}
                        <span className={`finish-pill ${card.foil ? "foil" : ""}`}>
                          {card.foil ? "Foil" : "Non foil"}
                        </span>
                      </div>
                    </div>

                    <div className="price-row">
                      <span>{currency.format(card.price)}</span>
                      <small>
                        {card.condition ? `${card.condition} - ` : ""}
                        {stock} en stock
                      </small>
                    </div>
                  </div>
                </article>
              );
            })}

            {!loadingCatalog && filteredCards.length === 0 ? (
              <p className="status-message">No encontre cartas con esos filtros.</p>
            ) : null}
          </div>

          {visibleCards.length < filteredCards.length ? (
            <div className="scroll-sentinel" ref={loadMoreRef} aria-hidden="true">
              <Loader2 size={22} className="spin" />
            </div>
          ) : null}
        </div>

        <aside className="order-panel" aria-label="Pedido seleccionado">
          <div className="order-header">
            <div>
              <p className="eyebrow">Pedido</p>
              <h2>{selectedItemCount} cartas</h2>
            </div>
            <Coins size={24} aria-hidden="true" />
          </div>

          <div className="order-list">
            {selectedCards.length === 0 ? (
              <p>Selecciona cartas para armar el mensaje de compra.</p>
            ) : (
              selectedCards.map((card) => (
                <div className="order-item" key={card.key}>
                  <span>{card.name}</span>
                  <div className="quantity-stepper" aria-label={`Cantidad de ${card.name}`}>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedQuantity(
                          card.key,
                          (selectedQuantities[card.key] ?? 1) - 1
                        )
                      }
                      title="Reducir cantidad"
                    >
                      <Minus size={14} />
                    </button>
                    <strong>{selectedQuantities[card.key]}</strong>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedQuantity(
                          card.key,
                          (selectedQuantities[card.key] ?? 1) + 1
                        )
                      }
                      disabled={(selectedQuantities[card.key] ?? 1) >= (card.quantity ?? 1)}
                      title="Aumentar cantidad"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <strong>{currency.format(card.price * (selectedQuantities[card.key] ?? 1))}</strong>
                  <button
                    type="button"
                    onClick={() => toggleCard(card.key)}
                    title="Quitar del pedido"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="order-total">
            <span>Total</span>
            <strong>{currency.format(selectedTotal)}</strong>
          </div>

          <button
            className="copy-button"
            type="button"
            onClick={copyOrder}
            disabled={selectedItemCount === 0}
          >
            {copyState === "copied" ? <Check size={18} /> : <Clipboard size={18} />}
            {copyState === "copied" ? "Copiado" : "Copiar pedido"}
          </button>

          {copyState === "error" ? (
            <p className="copy-error">El navegador bloqueo el portapapeles.</p>
          ) : null}
        </aside>
      </section>

    </main>
  );
}
