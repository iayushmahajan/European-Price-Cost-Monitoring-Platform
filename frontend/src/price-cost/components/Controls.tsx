import type { Domain } from "../api";
import { useCatalogue } from "../catalogue-context";
import { Field } from "./Shared";
const domains: [Domain, string][] = [
  ["fuel", "Fuel prices"],
  ["inflation", "Consumer inflation"],
  ["exchange-rates", "Exchange rates"],
];
export function DomainTabs({
  domain,
  onChange,
}: {
  domain: Domain;
  onChange: (domain: Domain) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Information domain"
      className="pc-domain-tabs"
    >
      {domains.map(([id, label]) => (
        <button
          key={id}
          aria-pressed={id === domain}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
export function CountrySelect({
  country,
  domain,
  onChange,
}: {
  country: string;
  domain: Domain;
  onChange: (code: string) => void;
}) {
  const catalogue = useCatalogue();
  return domain === "exchange-rates" ? null : (
    <Field label="Country">
      <select
        aria-label="Country"
        value={country}
        onChange={(e) => onChange(e.target.value)}
      >
        {catalogue.geographies
          .filter((g) => domain !== "fuel" || g.code !== "EU27_2020")
          .map((g) => (
            <option key={g.code} value={g.code}>
              {g.name}
            </option>
          ))}
      </select>
    </Field>
  );
}
