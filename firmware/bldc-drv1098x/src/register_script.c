#include "register_script.h"

static drv1098x_status_t script_write(drv1098x_t *dev, uint8_t reg, uint8_t value)
{
    if (!dev || !dev->bus.write_reg) {
        return DRV1098X_BAD_ARG;
    }
    return dev->bus.write_reg(dev->bus.ctx, dev->addr, reg, value) == I2C_OK
               ? DRV1098X_OK
               : DRV1098X_IO;
}

static drv1098x_status_t script_read(drv1098x_t *dev, uint8_t reg, uint8_t *value)
{
    if (!dev || !value || !dev->bus.read_reg) {
        return DRV1098X_BAD_ARG;
    }
    return dev->bus.read_reg(dev->bus.ctx, dev->addr, reg, value) == I2C_OK
               ? DRV1098X_OK
               : DRV1098X_IO;
}

register_script_result_t register_script_run(drv1098x_t *dev,
                                             const register_op_t *ops,
                                             size_t count,
                                             void (*delay_ms)(unsigned))
{
    register_script_result_t result = {
        .completed = 0,
        .failed_index = 0,
        .observed = 0,
        .ok = true,
    };

    if (!dev || (!ops && count > 0)) {
        result.ok = false;
        return result;
    }

    for (size_t i = 0; i < count; ++i) {
        const register_op_t *op = &ops[i];
        drv1098x_status_t rc = DRV1098X_OK;

        switch (op->kind) {
            case REG_OP_WRITE:
                rc = script_write(dev, op->reg, op->value);
                break;
            case REG_OP_READ_EXPECT:
                rc = script_read(dev, op->reg, &result.observed);
                if (rc == DRV1098X_OK && (result.observed & op->mask) != (op->value & op->mask)) {
                    result.ok = false;
                    result.failed_index = i;
                    return result;
                }
                break;
            case REG_OP_DELAY_MS:
                if (delay_ms) {
                    delay_ms(op->delay_ms);
                }
                break;
            default:
                result.ok = false;
                result.failed_index = i;
                return result;
        }

        if (rc != DRV1098X_OK) {
            result.ok = false;
            result.failed_index = i;
            return result;
        }
        result.completed++;
    }

    return result;
}

const register_op_t *register_script_reverse_enable(size_t *count)
{
    /*
     * This sequence is intentionally runtime-register-only. EEPROM programming
     * is not represented here because the audit could not verify that step.
     */
    static const register_op_t ops[] = {
        {
            .kind = REG_OP_READ_EXPECT,
            .reg = DRV1098X_REG_STATUS,
            .value = 0x00,
            .mask = DRV1098X_STATUS_OVER_TEMP | DRV1098X_STATUS_OVER_CURRENT,
            .delay_ms = 0,
            .note = "confirm no thermal/current sticky fault before changing mode",
        },
        {
            .kind = REG_OP_WRITE,
            .reg = DRV1098X_REG_SYS_OPT1,
            .value = DRV1098X_SYS_OPT1_REVERSE_DRIVE_ENABLE,
            .mask = 0x00,
            .delay_ms = 0,
            .note = "enable reverse drive processing for exhaust characterization",
        },
        {
            .kind = REG_OP_DELAY_MS,
            .reg = 0x00,
            .value = 0x00,
            .mask = 0x00,
            .delay_ms = 20,
            .note = "let the driver settle before sending a speed command",
        },
    };
    if (count) {
        *count = sizeof(ops) / sizeof(ops[0]);
    }
    return ops;
}

