import type { ExampleItem } from "../types/query";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
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
      <div className="composer-icon" aria-hidden="true"><Sparkles /></div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label
          htmlFor="question"
          className="block text-base font-semibold text-foreground"
        >
          Ask a question about European retail
        </label>
        <p id="question-hint" className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Compare markets, inspect categories, or investigate a change.
        </p>
        <textarea
          id="question"
          aria-describedby="question-hint"
          maxLength={2000}
          value={question}
          disabled={isLoading}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder="How has Germany's total retail index changed since 2021?"
          className="input analyst-input"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button disabled={isLoading || !question.trim()}>
            {isLoading ? <><LoaderCircle className="animate-spin" /> Working through the data…</> : <>Ask analyst <ArrowRight /></>}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={isLoading}
            onClick={onClear}
          >
            Clear results
          </Button>
          {isLoading && (
            <span role="status" className="ml-1 text-xs text-muted-foreground">
              Building and validating your answer…
            </span>
          )}
        </div>
      </form>
      <div className="query-suggestions" aria-label="Example questions">
        <span>Suggested</span>
        {examples.map((example) => (
          <button
            key={example.id}
            className="query-suggestion"
            disabled={isLoading}
            onClick={() => onQuestionChange(example.question)}
          >
            {example.question}
          </button>
        ))}
      </div>
    </section>
  );
}
