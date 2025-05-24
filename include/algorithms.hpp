#pragma once

#include<vector>
#include<tuple>
#include"graph.hpp"

struct PathResult
{
    std::vector<int> path;
    double length = 0.0;
    size_t nodeVisited = 0;
    double timeMS = 0.0;
    size_t memoryUsage = 0;
};

PathResult dijkstraAlgo(const Graph& g, int src, int dest);

PathResult astarAlgo(const Graph&g, int src, int dest);

PathResult findCriticalPoints(const Graph&g);