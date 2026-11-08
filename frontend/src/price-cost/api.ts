import { api, errorMessage } from "../lib/api";
import type {
  AnalysisHistoryItem,
  AnalysisResponse,
  Catalogue,
  CountryComparison,
  Evidence,
  ExchangeResponse,
  FuelResponse,
  InflationResponse,
  Overview,
  SourceStatus,
} from "./contracts";
export type Domain = "fuel" | "inflation" | "exchange-rates";
export type Metric =
  | FuelResponse["items"][number]
  | InflationResponse["items"][number]
  | ExchangeResponse["items"][number];
export type Metrics = FuelResponse | InflationResponse | ExchangeResponse;
export interface Clarification {
  question: string;
  answer: string;
}
class ResponseContractError extends Error {}
function checkedAnalysis(value: AnalysisResponse): AnalysisResponse {
  if (
    !value ||
    value.dataset !== "price_cost" ||
    value.schema_version !== 1 ||
    ![
      "success",
      "unavailable",
      "needs_clarification",
      "blocked",
      "failed",
    ].includes(value.status) ||
    typeof value.question !== "string" ||
    !Array.isArray(value.clarification) ||
    !Array.isArray(value.findings) ||
    value.findings.length > 3 ||
    !Array.isArray(value.evidence) ||
    value.evidence.length > 200 ||
    !value.table ||
    !Array.isArray(value.table.rows) ||
    value.table.rows.length > 100 ||
    !Array.isArray(value.table.columns) ||
    value.table.columns.length > 20 ||
    (value.status === "success" && !value.verified_data)
  )
    throw new ResponseContractError(
      "The analytical response could not be verified. Please retry or start a new question.",
    );
  return value;
}
const root = "/v1/price-cost";
export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await api.get<T>(root + path, { signal })).data;
}
export const priceCost = {
  catalogue: (signal?: AbortSignal) => get<Catalogue>("/catalogue", signal),
  sources: (signal?: AbortSignal) => get<SourceStatus[]>("/sources", signal),
  overview: (country: string, currency: string, signal?: AbortSignal) =>
    get<Overview>(
      `/overview?${new URLSearchParams({ country, currency })}`,
      signal,
    ),
  metrics: (
    domain: Domain,
    operation: "latest" | "history",
    params: Record<string, string>,
    signal?: AbortSignal,
  ) =>
    get<Metrics>(
      `/${domain}/${operation}?${new URLSearchParams(params)}`,
      signal,
    ),
  compare: (
    domain: "fuel" | "inflation",
    params: Record<string, string>,
    signal?: AbortSignal,
  ) =>
    get<CountryComparison>(
      `/${domain}/compare?${new URLSearchParams(params)}`,
      signal,
    ),
  evidence: (path: string, signal?: AbortSignal) => {
    // Evidence paths are API-relative. Never follow an arbitrary URL supplied by data.
    if (
      !/^\/v1\/price-cost\/evidence\/(fuel|inflation|exchange-rates)\/[1-9]\d*$/.test(
        path,
      )
    )
      throw new Error("Unsupported evidence path");
    return get<Evidence>(path.slice(root.length), signal);
  },
  query: async (
    question: string,
    clarification: Clarification[],
    signal?: AbortSignal,
  ) =>
    checkedAnalysis(
      (
        await api.post<AnalysisResponse>(
          root + "/analyst/query",
          { question, clarification },
          { signal },
        )
      ).data,
    ),
  history: (signal?: AbortSignal) =>
    get<AnalysisHistoryItem[]>("/analyst/history?limit=20", signal),
  restore: async (id: number, signal?: AbortSignal) => {
    const response = await get<AnalysisResponse>(
      `/analyst/history/${id}`,
      signal,
    );
    return checkedAnalysis(response);
  },
};
export function requestError(error: unknown): string {
  if (error instanceof ResponseContractError) return error.message;
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  const labels: Record<number, string> = {
    429: "The analyst is receiving too many requests. Try again later.",
    502: "The provider returned an invalid response. Please try again.",
    503: "The service is unavailable. Please try again later.",
    504: "The analyst timed out. Try a narrower question.",
    409: "This saved analysis cannot be restored. Start a new question.",
    404: "The requested data or saved analysis could not be found.",
  };
  return labels[status ?? 0] ?? errorMessage(error);
}
