#ifndef DRV1098X_H
#define DRV1098X_H

#include <stdbool.h>
#include <stdint.h>

#include "i2c_bus.h"

#define DRV1098X_I2C_ADDR_7BIT 0x52u

typedef enum {
    DRV1098X_REG_SPEED_CTRL1 = 0x00,
    DRV1098X_REG_SPEED_CTRL2 = 0x01,
    DRV1098X_REG_DEV_CTRL = 0x02,
    DRV1098X_REG_EE_CTRL = 0x03,
    DRV1098X_REG_STATUS = 0x10,
    DRV1098X_REG_MOTOR_SPEED1 = 0x11,
    DRV1098X_REG_MOTOR_SPEED2 = 0x12,
    DRV1098X_REG_MOTOR_PERIOD1 = 0x13,
    DRV1098X_REG_MOTOR_PERIOD2 = 0x14,
    DRV1098X_REG_MOTOR_KT1 = 0x15,
    DRV1098X_REG_MOTOR_KT2 = 0x16,
    DRV1098X_REG_MOTOR_CURRENT1 = 0x17,
    DRV1098X_REG_MOTOR_CURRENT2 = 0x18,
    DRV1098X_REG_SUPPLY_VOLTAGE = 0x1A,
    DRV1098X_REG_SPEED_CMD = 0x1B,
    DRV1098X_REG_SPEED_BUFFER = 0x1C,
    DRV1098X_REG_FAULT_CODE = 0x1E,
    DRV1098X_REG_SYS_OPT1 = 0x23
} drv1098x_register_t;

#define DRV1098X_SPEED_CTRL2_OVERRIDE 0x80u
#define DRV1098X_STATUS_OVER_TEMP 0x80u
#define DRV1098X_STATUS_SLEEP_STANDBY 0x40u
#define DRV1098X_STATUS_OVER_CURRENT 0x20u
#define DRV1098X_STATUS_MOTOR_LOCK 0x10u
#define DRV1098X_SYS_OPT1_REVERSE_DRIVE_ENABLE 0x04u

typedef enum {
    DRV1098X_OK = 0,
    DRV1098X_BAD_ARG = -1,
    DRV1098X_IO = -2
} drv1098x_status_t;

typedef enum {
    DRV1098X_DIR_FORWARD = 0,
    DRV1098X_DIR_REVERSE = 1
} drv1098x_direction_t;

typedef struct {
    i2c_bus_t bus;
    uint8_t addr;
    void *dir_ctx;
    void (*set_dir_pin)(void *ctx, drv1098x_direction_t dir);
} drv1098x_t;

typedef struct {
    bool over_temperature;
    bool sleep_or_standby;
    bool over_current;
    bool motor_lock;
} drv1098x_status_flags_t;

typedef struct {
    double speed_hz;
    double current_a;
    double supply_v;
    uint8_t fault_code;
    drv1098x_status_flags_t status;
} drv1098x_telemetry_t;

drv1098x_status_t drv1098x_init(drv1098x_t *dev,
                                i2c_bus_t bus,
                                void (*set_dir_pin)(void *, drv1098x_direction_t),
                                void *dir_ctx);
drv1098x_status_t drv1098x_set_speed_raw(drv1098x_t *dev, uint16_t speed_9bit);
drv1098x_status_t drv1098x_stop(drv1098x_t *dev);
drv1098x_status_t drv1098x_set_direction(drv1098x_t *dev, drv1098x_direction_t dir);
drv1098x_status_t drv1098x_enable_reverse_drive(drv1098x_t *dev, bool enable);
drv1098x_status_t drv1098x_read_telemetry(drv1098x_t *dev, drv1098x_telemetry_t *out);

uint16_t drv1098x_speed_percent_to_raw(unsigned percent);
double drv1098x_speed_raw_to_percent(uint16_t speed_9bit);
double drv1098x_decode_speed_hz(uint8_t msb, uint8_t lsb);
double drv1098x_decode_supply_voltage(uint8_t raw);
double drv1098x_decode_motor_current(uint8_t msb, uint8_t lsb);

#endif

