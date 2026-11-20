#include <cmath>
#include <vector>
#include <algorithm>
#include <emscripten/emscripten.h>

struct AABB {
    float minX, maxX, minY, maxY, minZ, maxZ;
};

static std::vector<AABB> g_colliders;

static bool rayHitsAABB(
    float ox, float oy, float oz,
    float dx, float dy, float dz,
    const AABB& b
) {
    float tmin = 0.0f;
    float tmax = 1.0f;

    auto slab = [&](float o, float d, float bmin, float bmax) -> bool {
        if (std::fabs(d) < 1e-6f) {
            return (o >= bmin && o <= bmax);
        }
        float invD = 1.0f / d;
        float t0 = (bmin - o) * invD;
        float t1 = (bmax - o) * invD;
        if (t0 > t1) std::swap(t0, t1);
        tmin = std::max(tmin, t0);
        tmax = std::min(tmax, t1);
        return tmax >= tmin;
    };

    if (!slab(ox, dx, b.minX, b.maxX)) return false;
    if (!slab(oy, dy, b.minY, b.maxY)) return false;
    if (!slab(oz, dz, b.minZ, b.maxZ)) return false;
    return true;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE
void cpp_clear_colliders() {
    g_colliders.clear();
}

EMSCRIPTEN_KEEPALIVE
void cpp_add_collider(float minX, float maxX, float minY, float maxY, float minZ, float maxZ) {
    g_colliders.push_back({minX, maxX, minY, maxY, minZ, maxZ});
}

// Returns 1 if line-of-sight is clear, 0 if blocked by any wall/furniture AABB
EMSCRIPTEN_KEEPALIVE
int cpp_has_los(float x1, float y1, float z1, float x2, float y2, float z2) {
    float dx = x2 - x1;
    float dy = y2 - y1;
    float dz = z2 - z1;
    for (const auto& box : g_colliders) {
        if (rayHitsAABB(x1, y1, z1, dx, dy, dz, box)) return 0;
    }
    return 1;
}

// Real FOV Cone + Distance + 3D AABB Raycast Line-of-Sight
EMSCRIPTEN_KEEPALIVE
int cpp_is_spotted_los(
    float px, float py, float pz,
    float nx, float ny, float nz,
    float nyaw, float range, float cosHalfFov
) {
    float dx = px - nx;
    float dz = pz - nz;
    float distSq = dx * dx + dz * dz;
    if (distSq > range * range) return 0;

    // Close proximity (<1.3m) spots regardless of facing; otherwise check FOV cone
    if (distSq > 1.69f) {
        float dist = std::sqrt(distSq);
        float fwdX = std::sin(nyaw);
        float fwdZ = std::cos(nyaw);
        float dot = (dx * fwdX + dz * fwdZ) / dist;
        if (dot < cosHalfFov) return 0;
    }

    return cpp_has_los(nx, ny + 1.4f, nz, px, py + 1.15f, pz);
}

// Euclidean similarity in [0, 1]
EMSCRIPTEN_KEEPALIVE
float cpp_euclidean_score(float t1, float c1, float a1, float t2, float c2, float a2) {
    float dt = t1 - t2;
    float dc = c1 - c2;
    float da = a1 - a2;
    float dist = std::sqrt(dt * dt + dc * dc + da * da);
    return 1.0f / (1.0f + dist);
}

// Rebalanced deterministic rules (Games 1-4): Charm now raises Curiosity slightly (no free win)
EMSCRIPTEN_KEEPALIVE
float cpp_rule_delta(int choice_id, int mood_idx) {
    if (choice_id == 0) { // Bluff
        if (mood_idx == 0) return -0.06f;
        if (mood_idx == 1) return  0.16f;
        return 0.04f;
    } else if (choice_id == 1) { // Charm
        if (mood_idx == 0) return  0.14f;
        if (mood_idx == 1) return  0.06f;
        return -0.08f;
    } else { // Intimidate
        if (mood_idx == 0) return -0.26f;
        if (mood_idx == 1) return  0.08f;
        return 0.28f;
    }
}

}