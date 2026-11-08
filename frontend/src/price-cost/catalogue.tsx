import { type ReactNode } from "react";
import { priceCost } from "./api";
import { useResource } from "./resource";
import { ResourceState } from "./components/Shared";
import { CatalogueContext } from "./catalogue-context";
export function CatalogueProvider({ children }: { children: ReactNode }) {
  const resource = useResource("catalogue", priceCost.catalogue);
  return (
    <ResourceState resource={resource}>
      {(data) => (
        <CatalogueContext.Provider value={data}>
          {children}
        </CatalogueContext.Provider>
      )}
    </ResourceState>
  );
}
