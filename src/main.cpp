#include <vector>
#include <string>
#include <sstream>
#include <fstream>
#include <string>
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

static size_t getCurrentRSSKB()
{
    std::ifstream file("/proc/self/status");
    std::string line;
    while (std::getline(file, line))
    {
        if (line.find("VmRSS:") == 0)
        {
            std::istringstream iss(line);
            std::string key;
            size_t value;
            std::string unit;
            iss >> key >> value >> unit;
            return value; // VmRSS in KB
        }
    }
    return 0;
}

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

    EXPORTED
    char *findKShortestRoutes(double lat1, double lon1, double lat2, double lon2, int astar)
    {
        int startId = g.findNearestNode(lat1, lon1);
        int endId = g.findNearestNode(lat2, lon2);

        if (startId < 0 || endId < 0)
        {
            std::cerr << "Invalid start or end node.\n";
            return nullptr;
        }

        ShortestPathFunc ShortestPathFunc = (astar) ? astarWithBlock : dijkstraWithBlock;

        auto start = std::chrono::high_resolution_clock::now();
        KPathsResult kPaths = yenKShortestPaths(g, startId, endId, ShortestPathFunc);
        auto end = std::chrono::high_resolution_clock::now();
        double execTime = std::chrono::duration<double, std::milli>(end - start).count();

        json output;
        output["executionTime"] = execTime;
        output["memoryUsage"] = getCurrentRSSKB(); // You can define this function using OS-specific tools.

        output["yenKShortestPaths"] = json::array();

        for (const auto &path : kPaths.paths)
        {
            json coordinates = json::array();
            for (int nodeId : path.path)
            {
                coordinates.push_back({g.nodes[nodeId].lat, g.nodes[nodeId].lon});
            }
            output["yenKShortestPaths"].push_back({{"coordinates", coordinates},
                                                   {"distance", path.length},
                                                   {"nodesVisited", path.nodeVisited},
                                                   {"timeMS", path.timeMS}, 
                                                   {"memoryUsage", path.memoryUsage}});
        }

        std::string *resultStr = new std::string(output.dump());
        return (char *)resultStr->c_str();
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

    std::string filename = "./data/routes.json";
    std::ofstream outFile(filename);
    try
    {
        std::cout << "Loading graph from “" << geojsonFile << "”...\n";
        initgraph(geojsonFile);
        std::cout << "Computing shortest paths between ("
                  << srcLat << ", " << srcLon << ") and ("
                  << dstLat << ", " << dstLon << ")...\n";
        int uastar = 0;
        char *str = findKShortestRoutes(srcLat, srcLon, dstLat, dstLon, uastar);

        outFile << str;
        outFile.close();
        std::cout << "  → Route JSON written to: " << filename << "\n";

        // std::cout << "Finding critical points...\n";
        // char *cpFile = criticalpoints();
        // std::cout << "  → Critical-points JSON written to: " << cpFile << "\n";
    }
    catch (const std::exception &e)
    {
        std::cerr << "Error: " << e.what() << "\n";
        return 1;
    }
#endif
    return 0;
}
