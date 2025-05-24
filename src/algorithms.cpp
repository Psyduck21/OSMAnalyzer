#include <chrono>
#include <vector>
#include <queue>
#include <limits>
#include <iostream>
#include <fstream>
#include <sstream>
#include <sys/resource.h>
#include <unistd.h>
#include <algorithm>
#include "graph.hpp"
#include "algorithms.hpp"
#include "json.hpp"

using json = nlohmann::json;

static size_t getMemoryUsageKB()
{
    struct rusage usage;
    getrusage(RUSAGE_SELF, &usage);
    return usage.ru_maxrss;
}

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

// dijkstra's algorithm to find the shortest path
PathResult dijkstraAlgo(const Graph &g, int src, int dest)
{
    int n = g.nodes.size();
    if (src < 0 || dest < 0 || src >= n || dest >= n)
    {
        throw std::out_of_range("dijkstraAlgo: src/dest index out of range");
    }

    auto t0 = std::chrono::steady_clock::now();
    const double INF = std::numeric_limits<double>::infinity();

    std::vector<double> dist(n, INF);
    std::vector<int> parent(n, -1);
    size_t nodeVisited = 0;

    using PDI = std::pair<double, int>;
    std::priority_queue<PDI, std::vector<PDI>, std::greater<PDI>> pq;

    dist[src] = 0.0;
    pq.push({0.0, src});

    while (!pq.empty())
    {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u])
            continue;
        nodeVisited++;
        if (u == dest)
            break;

        for (const Neighbor &neighbor : g.nodes[u].neighbors)
        {
            int v = neighbor.index;
            double w = neighbor.weight;
            double nd = dist[u] + w;
            if (nd < dist[v])
            {
                dist[v] = nd;
                parent[v] = u;
                pq.push({nd, v});
            }
        }
    }

    std::vector<int> path;
    if (dist[dest] < INF)
    {
        for (int cur = dest; cur != -1; cur = parent[cur])
        {
            path.push_back(cur);
        }
        std::reverse(path.begin(), path.end());
    }

    auto t1 = std::chrono::steady_clock::now();

    PathResult result;
    result.path = std::move(path);
    result.length = (result.path.empty() ? 0.0 : dist[dest]);
    result.nodeVisited = nodeVisited;
    result.timeMS = std::chrono::duration<double, std::milli>(t1 - t0).count();
    return result;
}

PathResult astarAlgo(const Graph &g, int src, int dest)
{
    int n = g.nodes.size();
    if (src < 0 || dest < 0 || src >= n || dest >= n)
    {
        throw std::out_of_range("astarAlgo: src/dest index out of range");
    }

    auto heuristic = [&](int u)
    {
        return Graph::haversine(g.nodes[u].lat, g.nodes[u].lon,
                                g.nodes[dest].lat, g.nodes[dest].lon);
    };

    auto t0 = std::chrono::steady_clock::now();
    const double INF = std::numeric_limits<double>::infinity();

    std::vector<double> gScore(n, INF), fScore(n, INF);
    std::vector<int> parent(n, -1);
    size_t nodeVisited = 0;

    using PDI = std::pair<double, int>;
    std::priority_queue<PDI, std::vector<PDI>, std::greater<PDI>> openSet;

    gScore[src] = 0.0;
    fScore[src] = heuristic(src);
    openSet.push({fScore[src], src});

    while (!openSet.empty())
    {
        auto [f, u] = openSet.top();
        openSet.pop();
        if (u == dest)
            break;
        if (f > fScore[u])
            continue;
        nodeVisited++;

        for (const Neighbor &neighbor : g.nodes[u].neighbors)
        {
            int v = neighbor.index;
            double w = neighbor.weight;
            double tentative = gScore[u] + w;
            if (tentative < gScore[v])
            {
                parent[v] = u;
                gScore[v] = tentative;
                fScore[v] = tentative + heuristic(v);
                openSet.push({fScore[v], v});
            }
        }
    }

    std::vector<int> path;
    if (gScore[dest] < INF)
    {
        for (int cur = dest; cur != -1; cur = parent[cur])
        {
            path.push_back(cur);
        }
        std::reverse(path.begin(), path.end());
    }

    auto t1 = std::chrono::steady_clock::now();

    PathResult result;
    result.path = std::move(path);
    result.length = (result.path.empty() ? 0.0 : gScore[dest]);
    result.nodeVisited = nodeVisited;
    result.timeMS = std::chrono::duration<double, std::milli>(t1 - t0).count();
    return result;
}

// Critical points (articulation points)

// modified DFS to check articulation points
static void dfsAP(int u, int parent, const Graph &g,
                  std::vector<int> &disc, std::vector<int> &low,
                  std::vector<bool> &isArt, int &time,
                  int root, int &children)
{
    disc[u] = low[u] = ++time;
    for (const Neighbor &neighbor : g.nodes[u].neighbors)
    {
        int v = neighbor.index;
        if (disc[v] == 0)
        {
            if (u == root)
                children++;
            dfsAP(v, u, g, disc, low, isArt, time, root, children);
            low[u] = std::min(low[u], low[v]);
            if ((u == root && children > 1) ||
                (u != root && low[v] >= disc[u]))
            {
                isArt[u] = true;
            }
        }
        else if (v != parent)
        {
            low[u] = std::min(low[u], disc[v]);
        }
    }
}

PathResult findCriticalPoints(const Graph &g)
{
    int n = g.nodes.size();
    if (n == 0)
    {
        throw std::runtime_error("findCriticalPoints: graph is empty");
    }

    auto t0 = std::chrono::steady_clock::now();
    size_t memBefore = getCurrentRSSKB();

    std::vector<int> disc(n, 0), low(n, 0);
    std::vector<bool> isArt(n, false);
    int t = 0;

    for (int i = 0; i < n; ++i)
    {
        if (disc[i] == 0)
        {
            int children = 0;
            dfsAP(i, -1, g, disc, low, isArt, t, i, children);
        }
    }

    PathResult arts;
    for (int i = 0; i < n; ++i)
    {
        if (isArt[i])
            arts.path.push_back(i);
    }

    auto t1 = std::chrono::steady_clock::now();
    size_t memAfter = getCurrentRSSKB();

    arts.timeMS = std::chrono::duration<double, std::milli>(t1 - t0).count();
    arts.memoryUsage = memAfter - memBefore;
    return arts;
}
