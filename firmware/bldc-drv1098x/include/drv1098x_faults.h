#ifndef DRV1098X_FAULTS_H
#define DRV1098X_FAULTS_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef enum {
    DRV1098X_FAULT_LOCK0_CURRENT_LIMIT = 0,
    DRV1098X_FAULT_LOCK1_ABNORMAL_SPEED = 1,
    DRV1098X_FAULT_LOCK2_ABNORMAL_KT = 2,
    DRV1098X_FAULT_NO_MOTOR = 3,
    DRV1098X_FAULT_LOCK4_OPEN_LOOP_STUCK = 4,
    DRV1098X_FAULT_LOCK5_CLOSED_LOOP_STUCK = 5
} drv1098x_fault_t;

typedef struct {
    drv1098x_fault_t code;
    const char *name;
    const char *probable_cause;
    const char *bringup_check;
} drv1098x_fault_info_t;

bool drv1098x_fault_is_set(uint8_t fault_reg, drv1098x_fault_t fault);
const drv1098x_fault_info_t *drv1098x_fault_info(drv1098x_fault_t fault);
size_t drv1098x_describe_faults(uint8_t fault_reg,
                                const drv1098x_fault_info_t **out,
                                size_t out_count);

#endif

