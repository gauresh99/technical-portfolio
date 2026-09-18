#include "motor_profile.h"

#include <string.h>

static const exhaust_speed_point_t atomberg_reverse_points[] = {
    {"low-exhaust", 28, 0.0},
    {"medium-exhaust", 48, 0.0},
    {"high-exhaust", 70, 0.0},
};

static const motor_profile_t default_profile = {
    "commercial-ceiling-fan-redacted",
    0.0,
    atomberg_reverse_points,
    sizeof(atomberg_reverse_points) / sizeof(atomberg_reverse_points[0]),
};

const motor_profile_t *motor_profile_default(void)
{
    return &default_profile;
}

const exhaust_speed_point_t *motor_profile_find(const motor_profile_t *profile,
                                                const char *name)
{
    if (!profile || !name) {
        return 0;
    }

    for (size_t i = 0; i < profile->point_count; ++i) {
        if (strcmp(profile->points[i].name, name) == 0) {
            return &profile->points[i];
        }
    }
    return 0;
}

