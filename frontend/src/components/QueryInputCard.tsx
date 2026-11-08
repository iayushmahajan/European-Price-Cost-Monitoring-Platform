import type { ExampleItem } from "../types/query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";

type Props = {
  question: string;
  isLoading: boolean;
  examples: ExampleItem[];
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
};
export function QueryInputCard({
  question,
  isLoading,
  examples,
  onQuestionChange,
  onSubmit,
  onClear,
}: Props) {
  return (
    <section className="query-composer">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="composer-heading">
          <div>
            <label htmlFor="question">Ask a question about European retail</label>
            <p id="question-hint">Compare markets, inspect categories, or investigate a change.</p>
          </div>
          <span className="composer-shortcut">Validated before execution</span>
        </div>
        <div className="composer-field">
          <textarea
            id="question"
            aria-describedby="question-hint"
            maxLength={2000}
            value={question}
            disabled={isLoading}
            onChange={(event) => onQuestionChange(event.target.value)}
            placeholder="How has Germany's total retail index changed since 2021?"
            className="analyst-input"
          />
          <div className="composer-actions">
            <Button type="button" variant="ghost" disabled={isLoading} onClick={onClear}>Clear</Button>
            <Button className="composer-submit" aria-label={isLoading ? "Working through the data…" : "Ask analyst"} disabled={isLoading || !question.trim()}>
              {isLoading ? <><LoaderCircle className="animate-spin" /> Analyzing…</> : <>Analyze <ArrowRight /></>}
            </Button>
          </div>
        </div>
        {isLoading && <div role="status" className="composer-progress"><span aria-hidden="true" /> Building a query, checking its safety, and calculating the answer…</div>}
      </form>
      <div className="query-suggestions" aria-label="Example questions">
        <span>Try a question</span>
        {examples.map((example) => (
          <button
            key={example.id}
            className="query-suggestion"
            disabled={isLoading}
            onClick={() => onQuestionChange(example.question)}
          >
            <span>{example.question}</span><ArrowRight aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
