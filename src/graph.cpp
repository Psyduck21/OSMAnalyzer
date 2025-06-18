#include <iostream>
#include <fstream>
#include <cmath>
#include <iomanip>
#include <limits>
#include "graph.hpp"
#include "json.hpp"

using json = nlohmann::json;

Graph::Graph(){};

// Get node index or create new node
int Graph::getNodeIndex(double lat, double lon) {
    auto key = std::make_pair(lat, lon);
    auto it = coordToIndex.find(key);
    if (it != coordToIndex.end()) {
        return it->second;
    }
    int index = (int)nodes.size();
    nodes.push_back({lat, lon, false, {}});
    coordToIndex[key] = index;
    return index;
}

// Haversine formula
double Graph::haversine(double lat1, double lon1, double lat2, double lon2) {
    static constexpr double R = 6371000.0; // meters
    double rLat1 = lat1 * M_PI / 180.0;
    double rLat2 = lat2 * M_PI / 180.0;
    double dLat = (lat2 - lat1) * M_PI / 180.0;
    double dLon = (lon2 - lon1) * M_PI / 180.0;

    double a = std::sin(dLat/2) * std::sin(dLat/2) +
               std::cos(rLat1) * std::cos(rLat2) *
               std::sin(dLon/2) * std::sin(dLon/2);
    double c = 2 * std::atan2(std::sqrt(a), std::sqrt(1 - a));
    return R * c;
}

// Calculate distance between two nodes by index
double Graph::calDistance(int id1, int id2) const {
    if (id1 < 0 || id2 < 0 || id1 >= (int)nodes.size() || id2 >= (int)nodes.size()) {
        throw std::out_of_range("calDistance: node index out of range");
    }
    const Node& n1 = nodes[id1];
    const Node& n2 = nodes[id2];
    return haversine(n1.lat, n1.lon, n2.lat, n2.lon);
}

// Load GeoJSON file to build graph
void Graph::loadFromGeoJSON(const std::string& filename) {
    std::ifstream in(filename);
    if (!in.is_open())
        throw std::runtime_error("Cannot open GeoJSON file: " + filename);

    json doc;
    try {
        in >> doc;
    } catch (const json::parse_error& e) {
        throw std::runtime_error(std::string("JSON parse error: ") + e.what());
    }

    if (!doc.contains("features") || !doc["features"].is_array())
        throw std::runtime_error("Invalid GeoJSON: missing 'features' array");

    for (auto& feature : doc["features"]) {
        if (!feature.contains("geometry") || !feature["geometry"].contains("type"))
            continue;

        auto& geom = feature["geometry"];
        if (geom["type"] == "LineString") {
            auto& coords = geom["coordinates"];
            if (!coords.is_array() || coords.size() < 2)
                continue;

            for (size_t i = 1; i < coords.size(); ++i) {
                double lon1 = coords[i - 1][0].get<double>();
                double lat1 = coords[i - 1][1].get<double>();
                double lon2 = coords[i][0].get<double>();
                double lat2 = coords[i][1].get<double>();

                int u = getNodeIndex(lat1, lon1);
                int v = getNodeIndex(lat2, lon2);
                double dist = haversine(lat1, lon1, lat2, lon2);

                nodes[u].neighbors.push_back({v, dist});
                nodes[v].neighbors.push_back({u, dist});
            }
        }
    }

    std::cout << "Loaded graph with " << nodes.size() << " nodes\n";
}

// Find nearest node to given coordinates
int Graph::findNearestNode(double lat, double lon) const {
    if (nodes.empty())
        throw std::runtime_error("findNearestNode: graph has no nodes");

    int bestID = -1;
    double bestDist = std::numeric_limits<double>::infinity();

    for (int i = 0; i < (int)nodes.size(); ++i) {
        double d = haversine(lat, lon, nodes[i].lat, nodes[i].lon);
        if (d < bestDist) {
            bestDist = d;
            bestID = i;
        }
    }
    return bestID;
}

double Graph::getLat(int index) const {
    if (index < 0 || index >= (int)nodes.size())
        throw std::out_of_range("getLat: index out of range");
    return nodes[index].lat;
}

double Graph::getLon(int index) const {
    if (index < 0 || index >= (int)nodes.size())
        throw std::out_of_range("getLon: index out of range");
    return nodes[index].lon;
}
