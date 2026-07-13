import { useOutletContext } from "react-router-dom";
import type { Game } from "../types/game";
import type { CatalogStatus } from "./useLiveCatalog";

export interface CatalogContextValue {
  games: Game[];
  status: CatalogStatus;
  loading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  mergeOne: (game: Game) => void;
}

export function useCatalog(): CatalogContextValue {
  return useOutletContext<CatalogContextValue>();
}
