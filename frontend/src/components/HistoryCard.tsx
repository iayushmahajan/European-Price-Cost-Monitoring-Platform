import { Clock3, RefreshCw } from "lucide-react";
import type { HistoryItem } from "../types/query";
import { Button } from "./ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "./ui/sheet";

type Props = {
  history: HistoryItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectHistoryItem: (item: HistoryItem) => void;
};

export function HistoryCard({ history, isLoading, onRefresh, onSelectHistoryItem }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="history-launcher">
          <span className="history-launcher-copy"><Clock3 aria-hidden="true" /><span><strong>Recent analyses</strong><small>{history.length} saved in this shared workspace</small></span></span>
          <span className="history-launcher-action">Open history</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col">
        <div className="pr-10">
          <SheetTitle>Recent analyses</SheetTitle>
          <SheetDescription className="mt-1">Reopen a saved result without running another model request.</SheetDescription>
        </div>
        <div className="mt-5 flex items-center justify-between border-y border-border py-3">
          <span className="text-xs text-muted-foreground">{history.length} saved</span>
          <Button variant="ghost" size="sm" disabled={isLoading} onClick={onRefresh}><RefreshCw /> Refresh</Button>
        </div>
        {history.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">No saved analyses yet.</p>
        ) : (
          <ul className="history-list">
            {history.map((item) => (
              <li key={item.id}>
                <SheetClose asChild>
                  <button disabled={isLoading} onClick={() => onSelectHistoryItem(item)}>
                    <span>{item.question}</span>
                    <small>Eurostat · {item.status.replaceAll("_", " ")} · {item.row_count ?? 0} {item.row_count === 1 ? "row" : "rows"} · {new Date(item.created_at).toLocaleDateString()}</small>
                  </button>
                </SheetClose>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
