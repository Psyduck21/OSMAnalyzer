#include <vector>
#include <string>
#include <sstream>
#include <fstream>
#include <iostream>
#include "graph.hpp"
#include "algorithms.hpp"
#include "json.hpp"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORTED EMSCRIPTEN_KEEPALIVE
#else
#define EXPORTED
#endif

static Graph g;
using json = nlohmann::json;

extern "C"
{

    // Load graph from GeoJSON path (Emscripten will read it from preloaded FS)
    EXPORTED
    void initgraph(const char *filename)
    {
        g.loadFromGeoJSON(filename);
    }

    // Find shortest route and return JSON string
    EXPORTED
    char *findshortestroute(double lat1, double lon1, double lat2, double lon2)
    {
        int startId = g.findNearestNode(lat1, lon1);
        int endId = g.findNearestNode(lat2, lon2);
        PathResult result;

        if (startId < 0 || endId < 0)
        {
            std::cerr << "Invalid start or end node.\n";
            return nullptr;
        }

        // Run Dijkstra and A*
        PathResult dijkstra = dijkstraAlgo(g, startId, endId);
        PathResult astar = astarAlgo(g, startId, endId);

        json doc;

        json dij_coords = json::array();
        for (int id : dijkstra.path)
            dij_coords.push_back({g.nodes[id].lat, g.nodes[id].lon});

        json astar_coords = json::array();
        for (int id : astar.path)
            astar_coords.push_back({g.nodes[id].lat, g.nodes[id].lon});

        doc["dijkstra"] = {
            {"coordinates", dij_coords},
            {"length", dijkstra.length},
            {"executionTime", dijkstra.timeMS}};

        doc["astar"] = {
            {"coordinates", astar_coords},
            {"length", astar.length},
            {"executionTime", astar.timeMS}};

        std::string *result_str = new std::string(doc.dump());
        return (char *)result_str->c_str();
    }

    // Find critical points
    EXPORTED
    char *criticalpoints()
    {
        PathResult cp = findCriticalPoints(g);
        json doc;

        json cp_coords = json::array();
        for (int id : cp.path)
            cp_coords.push_back({g.nodes[id].lat, g.nodes[id].lon});

        doc["criticalPoints"] = {
            {"coordinates", cp_coords},
            {"executionTime", cp.timeMS}};

        std::string *result_str = new std::string(doc.dump());
        return (char *)result_str->c_str();
    }
}

int main()
{
#ifndef __EMSCRIPTEN__
    std::cout << "Main function is running.\n";
    // ———————————— Test parameters ————————————
    const char *geojsonFile = "./data/dehradun.geojson";

    // ISBT Dehradun:  30.289248, , 77.997087:contentReference[oaicite:0]{index=0}
    double srcLat = 30.289248;
    double srcLon = 77.997087;

    // Clock Tower Dehradun: 30°19'27.5628\"N → 30.324323,
    //                      78° 2'30.7068\"E → 78.041863 :contentReference[oaicite:1]{index=1}
    double dstLat = 30.324323;
    double dstLon = 78.041863;

    try
    {
        std::cout << "Loading graph from “" << geojsonFile << "”...\n";
        initgraph(geojsonFile);
        std::cout << "Computing shortest paths between ("
                  << srcLat << ", " << srcLon << ") and ("
                  << dstLat << ", " << dstLon << ")...\n";

        char *routeFile = findshortestroute(srcLat, srcLon, dstLat, dstLon);
        std::cout << "  → Route JSON written to: " << routeFile << "\n";

        std::cout << "Finding critical points...\n";
        char *cpFile = criticalpoints();
        std::cout << "  → Critical-points JSON written to: " << cpFile << "\n";
    }
    catch (const std::exception &e)
    {
        std::cerr << "Error: " << e.what() << "\n";
        return 1;
    }
#endif
    return 0;
}
