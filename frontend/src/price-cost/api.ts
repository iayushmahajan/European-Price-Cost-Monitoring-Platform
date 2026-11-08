import { api, errorMessage } from '../lib/api';
import type { AnalysisHistoryItem, AnalysisResponse, Catalogue, CountryComparison, Evidence, ExchangeResponse, FuelResponse, InflationResponse, Overview, SourceStatus } from './contracts';
export type Domain = 'fuel' | 'inflation' | 'exchange-rates';
export type Metric = FuelResponse['items'][number] | InflationResponse['items'][number] | ExchangeResponse['items'][number];
export type Metrics = FuelResponse | InflationResponse | ExchangeResponse;
export interface Clarification { question: string; answer: string }
const root = '/v1/price-cost';
export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await api.get<T>(root + path, { signal })).data;
}
export const priceCost = {
  catalogue: (signal?: AbortSignal) => get<Catalogue>('/catalogue', signal),
  sources: (signal?: AbortSignal) => get<SourceStatus[]>('/sources', signal),
  overview: (country: string, currency: string, signal?: AbortSignal) => get<Overview>(`/overview?${new URLSearchParams({ country, currency })}`, signal),
  metrics: (domain: Domain, operation: 'latest' | 'history', params: Record<string, string>, signal?: AbortSignal) => get<Metrics>(`/${domain}/${operation}?${new URLSearchParams(params)}`, signal),
  compare: (domain: 'fuel' | 'inflation', params: Record<string, string>, signal?: AbortSignal) => get<CountryComparison>(`/${domain}/compare?${new URLSearchParams(params)}`, signal),
  evidence: (path: string, signal?: AbortSignal) => {
    // Evidence paths are API-relative. Never follow an arbitrary URL supplied by data.
    if (!/^\/v1\/price-cost\/evidence\/(fuel|inflation|exchange-rates)\/[1-9]\d*$/.test(path)) throw new Error('Unsupported evidence path');
    return get<Evidence>(path.slice(root.length), signal);
  },
  query: async (question: string, clarification: Clarification[], signal?: AbortSignal) => (await api.post<AnalysisResponse>(root + '/analyst/query', { question, clarification }, { signal })).data,
  history: (signal?: AbortSignal) => get<AnalysisHistoryItem[]>('/analyst/history?limit=20', signal),
  restore: async (id: number, signal?: AbortSignal) => {
    const response = await get<AnalysisResponse>(`/analyst/history/${id}`, signal);
    if (response.dataset !== 'price_cost' || response.schema_version !== 1) throw new Error('Unsupported saved analysis');
    return response;
  },
};
export function requestError(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const labels: Record<number, string> = { 429: 'The analyst is receiving too many requests. Try again later.', 502: 'The provider returned an invalid response. Please try again.', 503: 'The service is unavailable. Please try again later.', 504: 'The analyst timed out. Try a narrower question.', 409: 'This saved analysis cannot be restored. Start a new question.', 404: 'This record is no longer available.' };
  return labels[status ?? 0] ?? errorMessage(error);
}
