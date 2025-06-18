#pragma once

#include<vector>
#include<tuple>
#include <unordered_set>
#include <functional>
#include <sys/resource.h>
#include <unistd.h>
#include <fstream>
#include <sstream>
#include"graph.hpp"


static size_t getCurrentRSSKB();
static size_t getMemoryUsageKB();
struct PairIntHash {
    size_t operator()(const std::pair<int, int>& p) const {
        return std::hash<int>()(p.first) ^ (std::hash<int>()(p.second) << 1);
    }
};

struct PathResult
{
    std::vector<int> path;
    double length = 0.0;
    size_t nodeVisited = 0;
    double timeMS = 0.0;
    size_t memoryUsage = 0;
};

struct KPathsResult {
    std::vector<PathResult> paths;
    double timeMS = 0.0;
    size_t memoryUsage = 0;
};

using ShortestPathFunc = std::function<PathResult(const Graph&, int, int,
    const std::unordered_set<std::pair<int, int>, PairIntHash>&,
    const std::unordered_set<int>&)>;

PathResult astarWithBlock(const Graph& g, int src, int dest,
    const std::unordered_set<std::pair<int, int>, PairIntHash>& blockedEdges,
    const std::unordered_set<int>& blockedNodes);

PathResult dijkstraWithBlock(const Graph& g, int src, int dest,
    const std::unordered_set<std::pair<int, int>, PairIntHash>& blockedEdges,
    const std::unordered_set<int>& blockedNodes);

KPathsResult yenKShortestPaths(const Graph& g, int src, int dest, ShortestPathFunc shortestPathWithBlock);

PathResult findCriticalPoints(const Graph&g);