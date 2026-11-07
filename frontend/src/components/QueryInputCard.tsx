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
        <label
          htmlFor="question"
          className="block text-base font-semibold text-foreground"
        >
          What would you like to understand?
        </label>
        <p id="question-hint" className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Ask about retail indices, European Union countries, categories, changes, volatility or unusual movements since 2015.
        </p>
        <textarea
          id="question"
          aria-describedby="question-hint"
          maxLength={2000}
          value={question}
          disabled={isLoading}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder="How has Germany's total retail index changed since 2021?"
          className="input mt-4 min-h-28 resize-y text-[15px] leading-6"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button disabled={isLoading || !question.trim()}>
            {isLoading ? <><LoaderCircle className="animate-spin" /> Analyzing…</> : <>Analyze market <ArrowRight /></>}
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
              Interpreting, querying and calculating insights…
            </span>
          )}
        </div>
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
            {example.question}
          </button>
        ))}
      </div>
    </section>
  );
}
