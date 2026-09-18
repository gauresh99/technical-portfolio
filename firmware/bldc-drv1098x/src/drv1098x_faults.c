#include "drv1098x_faults.h"

static const drv1098x_fault_info_t fault_table[] = {
    {
        DRV1098X_FAULT_LOCK0_CURRENT_LIMIT,
        "lock0-current-limit",
        "Acceleration or lock-detect current limit tripped.",
        "Check phase wiring, startup current threshold, and whether the rotor is mechanically blocked.",
    },
    {
        DRV1098X_FAULT_LOCK1_ABNORMAL_SPEED,
        "lock1-abnormal-speed",
        "Measured speed is outside the expected closed-loop range.",
        "Check speed command ramp, FG feedback assumptions, and whether the commanded duty jumps too quickly.",
    },
    {
        DRV1098X_FAULT_LOCK2_ABNORMAL_KT,
        "lock2-abnormal-kt",
        "Measured BEMF constant does not match configured motor Kt window.",
        "Re-measure BEMF constant across the speed range before changing unrelated registers.",
    },
    {
        DRV1098X_FAULT_NO_MOTOR,
        "fault3-no-motor",
        "Driver did not see a motor load during startup.",
        "Check U/V/W continuity, connector seating, and whether the bench supply current limit is too low.",
    },
    {
        DRV1098X_FAULT_LOCK4_OPEN_LOOP_STUCK,
        "lock4-open-loop-stuck",
        "Startup did not reach the open-to-closed-loop threshold.",
        "Lower the threshold or soften the startup profile before suspecting I2C.",
    },
    {
        DRV1098X_FAULT_LOCK5_CLOSED_LOOP_STUCK,
        "lock5-closed-loop-stuck",
        "Closed-loop zero-crossing detection stalled.",
        "Check Kt configuration, speed stability, and supply sag under load.",
    },
};

bool drv1098x_fault_is_set(uint8_t fault_reg, drv1098x_fault_t fault)
{
    if (fault < DRV1098X_FAULT_LOCK0_CURRENT_LIMIT ||
        fault > DRV1098X_FAULT_LOCK5_CLOSED_LOOP_STUCK) {
        return false;
    }
    return (fault_reg & (uint8_t)(1u << fault)) != 0;
}

const drv1098x_fault_info_t *drv1098x_fault_info(drv1098x_fault_t fault)
{
    for (size_t i = 0; i < sizeof(fault_table) / sizeof(fault_table[0]); ++i) {
        if (fault_table[i].code == fault) {
            return &fault_table[i];
        }
    }
    return 0;
}

size_t drv1098x_describe_faults(uint8_t fault_reg,
                                const drv1098x_fault_info_t **out,
                                size_t out_count)
{
    size_t written = 0;
    for (size_t i = 0; i < sizeof(fault_table) / sizeof(fault_table[0]); ++i) {
        if (!drv1098x_fault_is_set(fault_reg, fault_table[i].code)) {
            continue;
        }
        if (out && written < out_count) {
            out[written] = &fault_table[i];
        }
        written++;
    }
    return written;
}

