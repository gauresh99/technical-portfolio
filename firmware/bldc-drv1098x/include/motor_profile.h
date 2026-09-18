#ifndef MOTOR_PROFILE_H
#define MOTOR_PROFILE_H

#include <stddef.h>
#include <stdint.h>

typedef struct {
    const char *name;
    uint8_t speed_percent;
    double measured_current_a;
} exhaust_speed_point_t;

typedef struct {
    const char *motor_name;
    double bemf_constant_v_per_hz;
    const exhaust_speed_point_t *points;
    size_t point_count;
} motor_profile_t;

const motor_profile_t *motor_profile_default(void);
const exhaust_speed_point_t *motor_profile_find(const motor_profile_t *profile,
                                                const char *name);

#endif

