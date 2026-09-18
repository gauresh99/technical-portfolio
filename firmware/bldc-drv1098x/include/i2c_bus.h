#ifndef I2C_BUS_H
#define I2C_BUS_H

#include <stddef.h>
#include <stdint.h>

typedef enum {
    I2C_OK = 0,
    I2C_ERR_NACK = -1,
    I2C_ERR_TIMEOUT = -2,
    I2C_ERR_BUS = -3
} i2c_status_t;

typedef struct {
    void *ctx;
    i2c_status_t (*write_reg)(void *ctx, uint8_t addr, uint8_t reg, uint8_t value);
    i2c_status_t (*read_reg)(void *ctx, uint8_t addr, uint8_t reg, uint8_t *value);
} i2c_bus_t;

#endif

