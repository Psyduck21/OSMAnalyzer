// algorithms.cpp
#include "graph.hpp"
#include "algorithms.hpp"
#include <queue>
#include <unordered_set>
#include <vector>
#include <limits>
#include <iostream>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <chrono>
#include <stack>
#include <functional>
#include <sys/resource.h>
#include <unistd.h>

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

// // Utility hash for pair<int, int>
// struct PairIntHash {
//     size_t operator()(const std::pair<int, int>& p) const {
//         return std::hash<int>()(p.first) ^ (std::hash<int>()(p.second) << 1);
//     }
// };

PathResult dijkstraWithBlock(const Graph &g, int src, int dest,
                             const std::unordered_set<std::pair<int, int>, PairIntHash> &blockedEdges,
                             const std::unordered_set<int> &blockedNodes)
{
    const int n = static_cast<int>(g.nodes.size());
    const double INF = std::numeric_limits<double>::infinity();

    std::vector<double> dist(n, INF);
    std::vector<int> parent(n, -1);
    size_t nodeVisited = 0;

    using PDI = std::pair<double, int>;
    std::priority_queue<PDI, std::vector<PDI>, std::greater<>> pq;

    dist[src] = 0.0;
    pq.emplace(0.0, src);

    while (!pq.empty())
    {
        auto [d, u] = pq.top();
        pq.pop();

        if (d > dist[u])
            continue;
        if (u == dest)
            break;
        if (blockedNodes.count(u))
            continue;

        ++nodeVisited;

        for (const auto &neighbor : g.nodes[u].neighbors)
        {
            int v = neighbor.index;
            if (blockedNodes.count(v))
                continue;
            if (blockedEdges.count({u, v}))
                continue;

            double nd = dist[u] + neighbor.weight;
            if (nd < dist[v])
            {
                dist[v] = nd;
                parent[v] = u;
                pq.emplace(nd, v);
            }
        }
    }

    std::vector<int> path;
    if (dist[dest] < INF)
    {
        for (int cur = dest; cur != -1; cur = parent[cur])
            path.emplace_back(cur);
        std::reverse(path.begin(), path.end());
    }

    return {std::move(path), path.empty() ? 0.0 : dist[dest], nodeVisited};
}

PathResult astarWithBlock(const Graph &g, int src, int dest,
                          const std::unordered_set<std::pair<int, int>, PairIntHash> &blockedEdges,
                          const std::unordered_set<int> &blockedNodes)
{
    const int n = static_cast<int>(g.nodes.size());
    const double INF = std::numeric_limits<double>::infinity();

    auto heuristic = [&](int u)
    {
        return Graph::haversine(g.nodes[u].lat, g.nodes[u].lon,
                                g.nodes[dest].lat, g.nodes[dest].lon);
    };

    std::vector<double> gScore(n, INF), fScore(n, INF);
    std::vector<int> parent(n, -1);
    size_t nodeVisited = 0;

    using PDI = std::pair<double, int>;
    std::priority_queue<PDI, std::vector<PDI>, std::greater<>> openSet;

    gScore[src] = 0.0;
    fScore[src] = heuristic(src);
    openSet.emplace(fScore[src], src);

    while (!openSet.empty())
    {
        auto [f, u] = openSet.top();
        openSet.pop();

        if (u == dest)
            break;
        if (f > fScore[u])
            continue;
        if (blockedNodes.count(u))
            continue;

        ++nodeVisited;

        for (const auto &neighbor : g.nodes[u].neighbors)
        {
            int v = neighbor.index;
            if (blockedNodes.count(v))
                continue;
            if (blockedEdges.count({u, v}))
                continue;

            double tentative = gScore[u] + neighbor.weight;
            if (tentative < gScore[v])
            {
                parent[v] = u;
                gScore[v] = tentative;
                fScore[v] = tentative + heuristic(v);
                openSet.emplace(fScore[v], v);
            }
        }
    }

    std::vector<int> path;
    if (gScore[dest] < INF)
    {
        for (int cur = dest; cur != -1; cur = parent[cur])
            path.emplace_back(cur);
        std::reverse(path.begin(), path.end());
    }

    return {std::move(path), path.empty() ? 0.0 : gScore[dest], nodeVisited};
}
// Define function pointer type
using ShortestPathFunc = std::function<PathResult(const Graph &, int, int,
                                                  const std::unordered_set<std::pair<int, int>, PairIntHash> &,
                                                  const std::unordered_set<int> &)>;

KPathsResult yenKShortestPaths(const Graph &g, int src, int dest, ShortestPathFunc shortestPathWithBlock)
{
    auto t0 = std::chrono::steady_clock::now();
    KPathsResult result;

    // Step 1: Get the first shortest path (Dijkstra or A*)
    PathResult firstPath = shortestPathWithBlock(g, src, dest, {}, {});
    if (firstPath.path.empty())
        return result;

    // Calculate length of first path
    double firstLength = 0.0;
    for (size_t i = 0; i < firstPath.path.size() - 1; ++i)
    {
        const auto &neighbors = g.nodes[firstPath.path[i]].neighbors;
        auto it = std::find_if(neighbors.begin(), neighbors.end(),
                               [&](const Neighbor &nb)
                               { return nb.index == firstPath.path[i + 1]; });
        if (it != neighbors.end())
            firstLength += it->weight;
    }
    firstPath.length = firstLength;
    result.paths.push_back(firstPath);

    // Min-heap for candidate paths
    using Candidate = std::pair<double, PathResult>;
    auto cmp = [](const Candidate &a, const Candidate &b)
    { return a.first > b.first; };
    std::priority_queue<Candidate, std::vector<Candidate>, decltype(cmp)> candidates(cmp);

    // Step 2: Generate K-1 more paths
    for (int k = 1; k < 4; ++k)
    {
        const PathResult &lastPath = result.paths.back();

        for (size_t i = 0; i < lastPath.path.size() - 1; ++i)
        {
            int spurNode = lastPath.path[i];
            std::vector<int> rootPath(lastPath.path.begin(), lastPath.path.begin() + i + 1);

            std::unordered_set<std::pair<int, int>, PairIntHash> blockedEdges;
            std::unordered_set<int> blockedNodes;

            for (const auto &p : result.paths)
            {
                if (p.path.size() > i && std::equal(rootPath.begin(), rootPath.end(), p.path.begin()))
                    blockedEdges.emplace(p.path[i], p.path[i + 1]);
            }

            for (int node : rootPath)
            {
                if (node != spurNode)
                    blockedNodes.insert(node);
            }

            PathResult spurPath = shortestPathWithBlock(g, spurNode, dest, blockedEdges, blockedNodes);
            if (!spurPath.path.empty())
            {
                std::vector<int> totalPath = rootPath;
                totalPath.insert(totalPath.end(), spurPath.path.begin() + 1, spurPath.path.end());

                double totalLength = 0.0;
                for (size_t idx = 0; idx < totalPath.size() - 1; ++idx)
                {
                    const auto &neighbors = g.nodes[totalPath[idx]].neighbors;
                    auto it = std::find_if(neighbors.begin(), neighbors.end(),
                                           [&](const Neighbor &nb)
                                           { return nb.index == totalPath[idx + 1]; });
                    if (it != neighbors.end())
                        totalLength += it->weight;
                }

                // IMPORTANT: Set the length property for the PathResult
                PathResult candidatePath;
                candidatePath.path = std::move(totalPath);
                candidatePath.length = totalLength; // ← ADDED: Set length property

                candidates.emplace(totalLength, candidatePath);
            }
        }

        if (candidates.empty())
            break;

        // Ensure the selected path has length property set
        PathResult selectedPath = candidates.top().second;
        // Length should already be set above, but double-check
        if (selectedPath.length == 0.0 && selectedPath.path.size() > 1)
        {
            // Recalculate length if somehow missing
            double recalcLength = 0.0;
            for (size_t idx = 0; idx < selectedPath.path.size() - 1; ++idx)
            {
                const auto &neighbors = g.nodes[selectedPath.path[idx]].neighbors;
                auto it = std::find_if(neighbors.begin(), neighbors.end(),
                                       [&](const Neighbor &nb)
                                       { return nb.index == selectedPath.path[idx + 1]; });
                if (it != neighbors.end())
                    recalcLength += it->weight;
            }
            selectedPath.length = recalcLength;
        }

        result.paths.push_back(selectedPath);
        candidates.pop();
    }

    auto t1 = std::chrono::steady_clock::now();
    result.timeMS = std::chrono::duration<double, std::milli>(t1 - t0).count();
    result.memoryUsage = getMemoryUsageKB();

    return result;
}

static void dfsAP_iterative(int root, const Graph &g,
                            std::vector<int> &disc, std::vector<int> &low,
                            std::vector<bool> &isArt, int &time)
{
    struct Frame
    {
        int u, parent, childIndex;
        bool returning;
    };

    std::stack<Frame> stk;
    stk.push({root, -1, 0, false});
    int children = 0;

    while (!stk.empty())
    {
        Frame &frame = stk.top();
        int u = frame.u, parent = frame.parent;

        if (!frame.returning)
        {
            disc[u] = low[u] = ++time;
            frame.returning = true;
        }

        auto &neighbors = g.nodes[u].neighbors;
        while (frame.childIndex < neighbors.size())
        {
            int v = neighbors[frame.childIndex++].index;
            if (v == parent)
                continue;

            if (disc[v] == 0)
            {
                if (parent == -1)
                    children++;
                stk.push({v, u, 0, false});
                break;
            }
            else
            {
                low[u] = std::min(low[u], disc[v]);
            }
        }

        if (frame.childIndex >= neighbors.size())
        {
            stk.pop();
            if (parent != -1)
            {
                low[parent] = std::min(low[parent], low[u]);
                if (low[u] >= disc[parent])
                    isArt[parent] = true;
            }
            else
            {
                if (children > 1)
                    isArt[u] = true;
            }
        }
    }
}

PathResult findCriticalPoints(const Graph &g)
{
    int n = g.nodes.size();
    if (n == 0)
        throw std::runtime_error("Graph is empty");

    auto t0 = std::chrono::steady_clock::now();
    size_t memBefore = getCurrentRSSKB(); // You already have this

    std::vector<int> disc(n, 0), low(n, 0);
    std::vector<bool> isArt(n, false);
    int time = 0;

    for (int i = 0; i < n; ++i)
    {
        if (disc[i] == 0)
        {
            dfsAP_iterative(i, g, disc, low, isArt, time);
        }
    }

    PathResult result;
    for (int i = 0; i < n; ++i)
        if (isArt[i])
            result.path.push_back(i);

    auto t1 = std::chrono::steady_clock::now();
    size_t memAfter = getCurrentRSSKB();

    result.timeMS = std::chrono::duration<double, std::milli>(t1 - t0).count();
    result.memoryUsage = memAfter - memBefore;
    return result;
}