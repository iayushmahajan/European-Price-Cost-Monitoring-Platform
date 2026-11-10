import { useEffect, useReducer, useState } from "react";
import { requestError } from "./api";
export interface Resource<T> {
  data?: T;
  loading: boolean;
  error: string;
  retry?: () => void;
}
/** One request per semantic key. Cleanup cancels transport and ignores late completions. */
export function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): Resource<T> {
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  const requestKey = JSON.stringify([key, attempt]);
  const [state, setState] = useState<Resource<T> & { key: string }>({
    key: "",
    loading: true,
    error: "",
  });
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setState({ key: requestKey, data, loading: false, error: "" });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState({
            key: requestKey,
            loading: false,
            error: requestError(error),
          });
      },
    );
    return () => controller.abort();
    // A request key fully encodes the endpoint and filters; callback identity must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  return {
    ...(state.key === requestKey ? state : { loading: true, error: "" }),
    retry,
  };
}
