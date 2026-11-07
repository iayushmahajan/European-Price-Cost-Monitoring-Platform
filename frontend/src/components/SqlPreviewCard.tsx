import { useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { Button } from "./ui/button";

export function SqlPreviewCard({ sql }: { sql: string }) {
  const [notice, setNotice] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      setNotice("SQL copied.");
    } catch {
      setNotice("Clipboard unavailable. Select and copy the SQL below.");
    }
  }
  return (
    <details className="sql-disclosure">
      <summary>Inspect SQL</summary>
      <div className="sql-toolbar">
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          {notice === "SQL copied." ? <Check /> : <Clipboard />} Copy SQL
        </Button>
        <span role="status" className="text-xs text-muted-foreground">
          {notice}
        </span>
      </div>
      <pre className="sql-code">
        <code>{sql}</code>
      </pre>
    </details>
  );
}
