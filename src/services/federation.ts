/**
 * Fetching for `SERVICE`, which the engine cannot do for itself.
 *
 * `holos-wasm` has no network client. It reports the `(endpoint, query)` pairs a federated
 * query wants and leaves the fetching to whoever is hosting it, which is this file. That is
 * the design rather than a gap: the engine cannot be made to request anything, so the decision
 * about what may be called lives here, in one readable place, instead of inside a wasm module.
 *
 * # Why an allow-list, in a browser
 *
 * The request is the user's own, from their own browser, with their own network position and
 * CORS between them and the endpoint — so this is not the server-side request forgery problem
 * that makes remote `SERVICE` unsafe on a server. A user who can run a query here could also
 * type the URL into the address bar.
 *
 * The risk that remains is a *shared* query file. Someone opens a `.rq` from a colleague or a
 * course, presses Run, and their browser calls whatever that file names — and a query string
 * can carry data in it. An allow-list means a file can only reach endpoints this editor has
 * decided are reasonable, which keeps the failure mode "this query will not run here" rather
 * than "this query quietly called somewhere".
 *
 * Extending it is a deliberate edit to this list, not a setting, because adding an entry is a
 * decision about what a shared file may do to a reader.
 */

/** Endpoints a `SERVICE` clause may name. Hosts only — scheme and path are checked separately. */
const ALLOWED_HOSTS: readonly string[] = [
  // The SPARQL_Course's module 08 federates to DBpedia.
  'dbpedia.org',
  // Wikidata, because it is the other endpoint anyone learning federation will reach for.
  'query.wikidata.org',
  'www.wikidata.org',
];

export class ServiceRefused extends Error {
  constructor(readonly endpoint: string, reason: string) {
    super(`SERVICE <${endpoint}> was not called: ${reason}`)
    this.name = 'ServiceRefused'
  }
}

/**
 * Whether a `SERVICE` IRI may be called, and why not when it may not.
 *
 * `https` only. An `http` endpoint would be blocked by the browser as mixed content anyway when
 * this editor is served over https, so allowing it would mean a failure the user cannot act on
 * rather than a refusal that says what is wrong.
 */
export function endpointRefusal(endpoint: string): string | undefined {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return 'it is not a URL'
  }
  if (url.protocol !== 'https:') {
    return `only https endpoints are called, and this one is ${url.protocol.replace(':', '')}`
  }
  if (!ALLOWED_HOSTS.includes(url.hostname)) {
    return `${url.hostname} is not in this editor's allow-list (${ALLOWED_HOSTS.join(', ')})`
  }
  return undefined
}

/**
 * Asks an endpoint a query and returns its SPARQL Results JSON, unparsed.
 *
 * Unparsed because the engine parses it: handing the text straight back keeps one parser in the
 * system rather than two that can disagree about what a term is.
 *
 * POST with `application/sparql-query` rather than a GET with the query in the URL — the
 * queries a `SERVICE` generates are long enough to meet URL limits, and a POST body does not end
 * up in anyone's access log.
 */
export async function fetchServiceResults(endpoint: string, query: string): Promise<string> {
  const refusal = endpointRefusal(endpoint)
  if (refusal) throw new ServiceRefused(endpoint, refusal)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        Accept: 'application/sparql-results+json',
      },
      body: query,
    })
  } catch (cause) {
    // A network failure and a CORS refusal are indistinguishable from here by design, so the
    // message names both rather than guessing.
    throw new ServiceRefused(
      endpoint,
      `the request failed — the endpoint may be unreachable, or may not allow cross-origin ` +
        `requests from this page (${cause instanceof Error ? cause.message : String(cause)})`,
    )
  }
  if (!response.ok) {
    throw new ServiceRefused(endpoint, `it answered HTTP ${response.status}`)
  }
  return response.text()
}

/** How many times a query may be re-run while `SERVICE` answers arrive. See the loop's note. */
export const MAX_FEDERATION_ROUNDS = 8

/** The part of a store that federation needs: ask, and be told what is missing. */
export interface FederatableStore {
  queryFederated(query: string, base?: string): { pending: ServiceRequest[]; result: unknown }
  cacheService(endpoint: string, query: string, results: string): void
}

/** One thing the host has to fetch before a query can be answered. */
export interface ServiceRequest {
  endpoint: string
  query: string
}

/** How a `SERVICE` answer is obtained. Injectable so the loop can be tested without a network. */
export type ServiceFetcher = (endpoint: string, query: string) => Promise<string>

/**
 * Runs a query, fetching whatever `SERVICE` clauses it names.
 *
 * The engine has no network client, so federation is a conversation: it reports the
 * `(endpoint, query)` pairs it wants, this fetches them and hands them back, and the query is
 * run again until nothing is outstanding.
 *
 * **A pass with anything pending has wrong results.** The unanswered `SERVICE` contributed no
 * rows, so the join above it lost rows too — which is why this never returns a pending pass's
 * result, and why a query that will not settle is an error rather than a partial answer that
 * looks like one.
 *
 * More than two rounds is normal rather than a fault. A `SERVICE` whose pattern carries bindings
 * from an earlier join only takes its final shape once that join has rows, and the first pass
 * gives it none, so an answer can reveal a request that could not have been seen before. The cap
 * is here rather than in the engine because only the host knows how long a person will wait.
 *
 * Lives here rather than in the hook that calls it so that it can be tested against a fake
 * store and a fake fetcher, which is the only way to exercise the round cap and the
 * discard-a-pending-pass rule without a network.
 */
export async function runFederatedQuery(
  store: FederatableStore,
  query: string,
  fetcher: ServiceFetcher = fetchServiceResults,
): Promise<unknown> {
  for (let round = 0; round < MAX_FEDERATION_ROUNDS; round += 1) {
    const pass = store.queryFederated(query, undefined)
    if (pass.pending.length === 0) return pass.result

    // Sequentially, not in parallel: a teaching query reaches one or two endpoints, and a
    // failure that names which endpoint is worth more than saving a round trip.
    for (const request of pass.pending) {
      store.cacheService(
        request.endpoint,
        request.query,
        await fetcher(request.endpoint, request.query),
      )
    }
  }
  throw new Error(
    `SERVICE did not settle after ${MAX_FEDERATION_ROUNDS} rounds. An endpoint that answers the ` +
      `same query differently each time will do this; so will a query whose SERVICE clauses ` +
      `depend on each other more deeply than that.`,
  )
}
