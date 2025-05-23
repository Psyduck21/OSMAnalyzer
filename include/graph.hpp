#pragma once

#include <vector>
#include <string>
#include <unordered_map>
#include <utility>
#include <cmath>

// Hash function for pair<double, double>
struct PairHash {
    std::size_t operator()(const std::pair<double, double>& p) const {
        auto h1 = std::hash<double>{}(p.first);
        auto h2 = std::hash<double>{}(p.second);
        return h1 ^ (h2 << 1);
    }
};

// Neighbor info: node index + edge weight
struct Neighbor {
    int index;
    double weight;
};

// Node stores coordinates, critical flag, and neighbors
struct Node {
    double lat;
    double lon;
    bool isCritical = false;
    std::vector<Neighbor> neighbors;
};

class Graph {
public:
    Graph();

    // Load graph from GeoJSON file (implementation in cpp)
    void loadFromGeoJSON(const std::string& filename);

    // Get or assign index for coordinate (lat, lon)
    int getNodeIndex(double lat, double lon);

    // Find nearest node to given lat/lon
    int findNearestNode(double lat, double lon) const;

    // Calculate distance (meters) between two node indices
    double calDistance(int id1, int id2) const;

    // Haversine formula to compute distance between lat/lon pairs
    static double haversine(double lat1, double lon1, double lat2, double lon2);

    // Access node coordinates by index
    double getLat(int index) const;
    double getLon(int index) const;

    // Store all graph nodes
    std::vector<Node> nodes;

private:
    // Map coordinates to node index for quick lookup
    std::unordered_map<std::pair<double, double>, int, PairHash> coordToIndex;
};
