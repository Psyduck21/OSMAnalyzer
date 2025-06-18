import createModule from './graph.js';

let wasmInstance = null;

/**
 * Initialize and return the WASM interface.
 */
export async function initWasm() {
  wasmInstance = await createModule();

  const allocateUTF8 = wasmInstance.allocateUTF8;
  const free = wasmInstance._free;
  const UTF8ToString = wasmInstance.UTF8ToString;

  /**
   * Utility to call a WASM function returning a pointer to a JSON string.
   * Handles allocation, parsing, and memory cleanup.
   * @param {() => number} wasmFunc - Function that returns a string pointer
   * @returns {object|null} Parsed result or null
   */
  function handleJsonResult(wasmFunc) {
    const ptr = wasmFunc();
    if (!ptr) return null;

    try {
      const jsonStr = UTF8ToString(ptr);
      const parsed = JSON.parse(jsonStr);
      // console.log(parsed);

      if (parsed && typeof parsed === 'object' && parsed.error) {
        console.error("WASM returned error:", parsed.error);
        return null;
      }

      return parsed;
    } catch (e) {
      console.error("Error parsing WASM result:", e);
      return null;
    } finally {
      free(ptr);
    }
  }

  return {
    /**
     * Load a graph from a file path (mounted via Emscripten FS)
     * @param {string} filename
     */
    initGraph: (filename) => {
      const ptr = allocateUTF8(filename);
      try {
        wasmInstance._initgraph(ptr);
      } finally {
        free(ptr);
      }
    },

    /**
     * Find shortest route using A* or Dijkstra
     * @param {number} lat1
     * @param {number} lon1
     * @param {number} lat2
     * @param {number} lon2
     * @param {number} useAstar - 1 = A*, 0 = Dijkstra
     * @returns {object|null} Parsed route or null on error
     */
    findkShortestRoute: (lat1, lon1, lat2, lon2, useastar) => {
      return handleJsonResult(() =>
        wasmInstance._findKShortestRoutes(lat1, lon1, lat2, lon2, useastar)
      );
    },

    /**
     * Get critical points from the graph.
     * @returns {object|null} Parsed critical point data or null
     */
    getCriticalPoints: () => {
      return handleJsonResult(() => wasmInstance._criticalpoints());
    },

    /**
     * Expose internal WASM utils if needed
     */
    _wasm: {
      allocateUTF8,
      free,
      UTF8ToString,
      rawModule: wasmInstance,
    },
  };
}
