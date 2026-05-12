import { state } from '../../state'


const fetchSubgraph = async <T>(query: string): Promise<T> => {
  const response = await fetch(state.subgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Subgraph request failed: ${response.status} ${response.statusText}`)
  }

  const json = await response.json() as { data?: T, errors?: Array<{ message: string }> }

  if (json.errors?.length) {
    throw new Error(`Subgraph query error: ${json.errors[0].message}`)
  }

  if (!json.data) {
    throw new Error('Subgraph returned empty data')
  }

  return json.data
}


export default fetchSubgraph
