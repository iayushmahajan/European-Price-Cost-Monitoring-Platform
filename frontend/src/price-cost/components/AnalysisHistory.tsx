import { priceCost } from "../api";
import { useResource } from "../resource";
import { timestamp } from "../format";
import { Panel, ResourceState } from "./Shared";
export function AnalysisHistory({
  onClose,
  onRestore,
}: {
  onClose: () => void;
  onRestore: (id: number) => void;
}) {
  const r = useResource("analyst-history", priceCost.history);
  return (
    <Panel
      title="Recent price-cost analyses"
      description="Saved snapshots restore without a new model call. Retail history remains in Legacy retail."
      onClose={onClose}
    >
      <ResourceState resource={r}>
        {(items) => (
          <>
            {items.length === 0 && <p>No saved price-cost analyses yet.</p>}
            {items
              .filter((i) => i.dataset === "price_cost")
              .map((i) => (
                <button
                  className="pc-history-row"
                  key={i.id}
                  onClick={() => onRestore(i.id)}
                >
                  <strong>{i.question}</strong>
                  <small>
                    {i.status} · schema {i.schema_version ?? "unknown"} ·{" "}
                    {timestamp(i.created_at)}
                  </small>
                </button>
              ))}
          </>
        )}
      </ResourceState>
    </Panel>
  );
}
