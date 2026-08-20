import { useState, useCallback } from 'react';
import { Store, Quad } from 'n3';

export interface SparqlResult {
  head?: { vars: string[] };
  results?: { bindings: Array<Record<string, { type: string; value: string }>> };
  rdfResult?: string;
  booleanResult?: boolean;
}

export function useSparqlEngine() {
  const [results, setResults] = useState<SparqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const executeQuery = useCallback(async (query: string, quads: Quad[]) => {
    setIsExecuting(true);
    setError(null);
    try {
      // Create a fresh store for each execution with the provided quads
      const store = new Store();
      quads.forEach(q => store.addQuad(q));
      
      const { QueryEngine } = await import('@comunica/query-sparql');
      const engine = new QueryEngine();
      const normalizedQuery = query.toLowerCase();

      const isDescribe = normalizedQuery.includes('describe ');

      // Rewrite simple DESCRIBE <uri> to CONSTRUCT if needed
      let effectiveQuery = query;
      if (isDescribe) {
        // Rewrite DESCRIBE <uri> or DESCRIBE ?var to CONSTRUCT
        const regex = /describe\s+(<[^>]+>|\?[a-zA-Z0-9_]+)/i;
        const match = query.match(regex);
        if (match) {
            const target = match[1];
            // Check if query has WHERE clause to avoid duplication
            const hasWhere = /\bwhere\b/i.test(query);
            
            if (hasWhere) {
                // Just replace the head, keep the existing WHERE clause
                effectiveQuery = query.replace(regex, `CONSTRUCT { ${target} ?p ?o }`);
            } else {
                // Add WHERE clause
                effectiveQuery = query.replace(regex, `CONSTRUCT { ${target} ?p ?o } WHERE { ${target} ?p ?o }`);
            }
        }
      }

      const result = await engine.query(effectiveQuery, { sources: [store] }) as any;

      if (result.resultType === 'bindings') {
        const bindingsStream = await result.execute();
        const metadata = await result.metadata();
        
        // Get variables from metadata
        let vars = metadata.variables.map((v: any) => v.value);

        // Attempt to preserve projection order from the query string
        try {
            const selectMatch = effectiveQuery.match(/select\s+(?:distinct\s+|reduced\s+)?(.+?)\s+where/is);
            if (selectMatch) {
                const projection = selectMatch[1].trim();
                if (projection !== '*') {
                   const extractedVars = projection.match(/\?[a-zA-Z0-9_]+/g);
                   if (extractedVars) {
                       const orderedVarNames = extractedVars.map(v => v.substring(1));
                       // Create new vars array based on projection order
                       const newVars = [];
                       const seen = new Set();
                       
                       // Add projected variables that exist in the result
                       for (const v of orderedVarNames) {
                           if (vars.includes(v) && !seen.has(v)) {
                               newVars.push(v);
                               seen.add(v);
                           }
                       }
                       
                       // Append any remaining variables (e.g. from wildcard expansion or implicit)
                       for (const v of vars) {
                           if (!seen.has(v)) {
                               newVars.push(v);
                           }
                       }
                       
                       if (newVars.length > 0) {
                           vars = newVars;
                       }
                   }
                }
            }
        } catch (e) {
            console.warn('Failed to parse variable order from query', e);
        }
        
        const bindings = await bindingsStream.toArray();
        
        const formattedBindings = bindings.map((binding: any) => {
          const row: any = {};
          vars.forEach((v: string) => {
            const term = binding.get(v);
            if (term) {
              row[v] = {
                type: term.termType === 'NamedNode' ? 'uri' :
                      term.termType === 'BlankNode' ? 'bnode' : 'literal',
                value: term.value
              };
              
              if (term.termType === 'Literal') {
                if (term.language) {
                  row[v]['xml:lang'] = term.language;
                }
                if (term.datatype && term.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') {
                  row[v].datatype = term.datatype.value;
                }
              }
            }
          });
          return row;
        });

        const resultObj = {
          head: { vars },
          results: { bindings: formattedBindings }
        };

        setResults(resultObj);
        return resultObj;
      } else if (result.resultType === 'quads') {
        const quadStream = await result.execute();
        
        // Serialize to Turtle using stream
        const { Writer } = await import('n3');
        const writer = new Writer({ format: 'Turtle' });
        
        const rdfString = await new Promise<string>((resolve, reject) => {
            quadStream.on('data', (quad: Quad) => writer.addQuad(quad));
            quadStream.on('end', () => {
                writer.end((err, res) => err ? reject(err) : resolve(res));
            });
            quadStream.on('error', reject);
        });

        const resultObj = { rdfResult: rdfString };
        setResults(resultObj as any);
        return resultObj;
      } else if (result.resultType === 'boolean') {
        const booleanResult = await result.execute();
        
        const resultObj = { booleanResult };
        setResults(resultObj as any);
        return resultObj;
      } else {
        throw new Error('Unsupported query type');
      }
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setIsExecuting(false);
    }
  }, []);

  return { executeQuery, results, error, isExecuting };
}