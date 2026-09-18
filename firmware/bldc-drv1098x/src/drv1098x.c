#include "drv1098x.h"

#include <stddef.h>

static drv1098x_status_t write_reg(drv1098x_t *dev, uint8_t reg, uint8_t value)
{
    if (!dev || !dev->bus.write_reg) {
        return DRV1098X_BAD_ARG;
    }
    return dev->bus.write_reg(dev->bus.ctx, dev->addr, reg, value) == I2C_OK
               ? DRV1098X_OK
               : DRV1098X_IO;
}

static drv1098x_status_t read_reg(drv1098x_t *dev, uint8_t reg, uint8_t *value)
{
    if (!dev || !value || !dev->bus.read_reg) {
        return DRV1098X_BAD_ARG;
    }
    return dev->bus.read_reg(dev->bus.ctx, dev->addr, reg, value) == I2C_OK
               ? DRV1098X_OK
               : DRV1098X_IO;
}

drv1098x_status_t drv1098x_init(drv1098x_t *dev,
                                i2c_bus_t bus,
                                void (*set_dir_pin)(void *, drv1098x_direction_t),
                                void *dir_ctx)
{
    if (!dev || !bus.write_reg || !bus.read_reg) {
        return DRV1098X_BAD_ARG;
    }

    dev->bus = bus;
    dev->addr = DRV1098X_I2C_ADDR_7BIT;
    dev->set_dir_pin = set_dir_pin;
    dev->dir_ctx = dir_ctx;
    return DRV1098X_OK;
}

drv1098x_status_t drv1098x_set_speed_raw(drv1098x_t *dev, uint16_t speed_9bit)
{
    if (!dev || speed_9bit > 0x01FFu) {
        return DRV1098X_BAD_ARG;
    }

    uint8_t msb = (uint8_t)((speed_9bit >> 8) & 0x01u);
    uint8_t lsb = (uint8_t)(speed_9bit & 0xFFu);

    /*
     * The datasheet requires the MSB to be written before the LSB because the
     * device snapshots the MSB when SpeedCtrl1 is written.
     */
    drv1098x_status_t rc =
        write_reg(dev, DRV1098X_REG_SPEED_CTRL2, DRV1098X_SPEED_CTRL2_OVERRIDE | msb);
    if (rc != DRV1098X_OK) {
        return rc;
    }
    return write_reg(dev, DRV1098X_REG_SPEED_CTRL1, lsb);
}

drv1098x_status_t drv1098x_stop(drv1098x_t *dev)
{
    return drv1098x_set_speed_raw(dev, 0);
}

drv1098x_status_t drv1098x_set_direction(drv1098x_t *dev, drv1098x_direction_t dir)
{
    if (!dev || (dir != DRV1098X_DIR_FORWARD && dir != DRV1098X_DIR_REVERSE)) {
        return DRV1098X_BAD_ARG;
    }

    if (dev->set_dir_pin) {
        dev->set_dir_pin(dev->dir_ctx, dir);
    }
    return DRV1098X_OK;
}

drv1098x_status_t drv1098x_enable_reverse_drive(drv1098x_t *dev, bool enable)
{
    uint8_t sysopt1 = 0;
    drv1098x_status_t rc = read_reg(dev, DRV1098X_REG_SYS_OPT1, &sysopt1);
    if (rc != DRV1098X_OK) {
        return rc;
    }

    if (enable) {
        sysopt1 |= DRV1098X_SYS_OPT1_REVERSE_DRIVE_ENABLE;
    } else {
        sysopt1 &= (uint8_t)~DRV1098X_SYS_OPT1_REVERSE_DRIVE_ENABLE;
    }
    return write_reg(dev, DRV1098X_REG_SYS_OPT1, sysopt1);
}

drv1098x_status_t drv1098x_read_telemetry(drv1098x_t *dev, drv1098x_telemetry_t *out)
{
    if (!out) {
        return DRV1098X_BAD_ARG;
    }

    uint8_t status = 0;
    uint8_t speed_hi = 0;
    uint8_t speed_lo = 0;
    uint8_t current_hi = 0;
    uint8_t current_lo = 0;
    uint8_t supply = 0;
    uint8_t fault = 0;

    drv1098x_status_t rc = read_reg(dev, DRV1098X_REG_STATUS, &status);
    if (rc != DRV1098X_OK) {
        return rc;
    }
    if ((rc = read_reg(dev, DRV1098X_REG_MOTOR_SPEED1, &speed_hi)) != DRV1098X_OK) {
        return rc;
    }
    if ((rc = read_reg(dev, DRV1098X_REG_MOTOR_SPEED2, &speed_lo)) != DRV1098X_OK) {
        return rc;
    }
    if ((rc = read_reg(dev, DRV1098X_REG_MOTOR_CURRENT1, &current_hi)) != DRV1098X_OK) {
        return rc;
    }
    if ((rc = read_reg(dev, DRV1098X_REG_MOTOR_CURRENT2, &current_lo)) != DRV1098X_OK) {
        return rc;
    }
    if ((rc = read_reg(dev, DRV1098X_REG_SUPPLY_VOLTAGE, &supply)) != DRV1098X_OK) {
        return rc;
    }
    if ((rc = read_reg(dev, DRV1098X_REG_FAULT_CODE, &fault)) != DRV1098X_OK) {
        return rc;
    }

    out->status.over_temperature = (status & DRV1098X_STATUS_OVER_TEMP) != 0;
    out->status.sleep_or_standby = (status & DRV1098X_STATUS_SLEEP_STANDBY) != 0;
    out->status.over_current = (status & DRV1098X_STATUS_OVER_CURRENT) != 0;
    out->status.motor_lock = (status & DRV1098X_STATUS_MOTOR_LOCK) != 0;
    out->speed_hz = drv1098x_decode_speed_hz(speed_hi, speed_lo);
    out->current_a = drv1098x_decode_motor_current(current_hi, current_lo);
    out->supply_v = drv1098x_decode_supply_voltage(supply);
    out->fault_code = fault;
    return DRV1098X_OK;
}

uint16_t drv1098x_speed_percent_to_raw(unsigned percent)
{
    if (percent > 100u) {
        percent = 100u;
    }
    return (uint16_t)((percent * 0x01FFu + 50u) / 100u);
}

double drv1098x_speed_raw_to_percent(uint16_t speed_9bit)
{
    if (speed_9bit > 0x01FFu) {
        speed_9bit = 0x01FFu;
    }
    return ((double)speed_9bit * 100.0) / 511.0;
}

double drv1098x_decode_speed_hz(uint8_t msb, uint8_t lsb)
{
    uint16_t raw = ((uint16_t)msb << 8) | lsb;
    return (double)raw / 10.0;
}

double drv1098x_decode_supply_voltage(uint8_t raw)
{
    return ((double)raw * 30.0) / 256.0;
}

double drv1098x_decode_motor_current(uint8_t msb, uint8_t lsb)
{
    uint16_t raw = (uint16_t)(((msb & 0x07u) << 8) | lsb);
    if (raw >= 1023u) {
        return 3.0 * ((double)raw - 1023.0) / 512.0;
    }
    return 3.0 * (double)raw / 512.0;
}

